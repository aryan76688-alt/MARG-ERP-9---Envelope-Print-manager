import { Party, PODSubmission } from '../types';

const DB_NAME = 'MARGEnvelopeDB';
const DB_VERSION = 3;

let dbInstance: IDBDatabase | null = null;

export function openEnvelopeDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Parties cache store
      if (!db.objectStoreNames.contains('parties')) {
        const partyStore = db.createObjectStore('parties', { keyPath: 'id' });
        partyStore.createIndex('party_name', 'party_name', { unique: false });
        partyStore.createIndex('city', 'city', { unique: false });
      }

      // 2. Offline print jobs queue (outbox)
      if (!db.objectStoreNames.contains('offline_jobs')) {
        db.createObjectStore('offline_jobs', { keyPath: 'client_uuid' });
      }

      // 3. Offline Proof of Delivery queue (outbox)
      if (!db.objectStoreNames.contains('offline_pods')) {
        db.createObjectStore('offline_pods', { keyPath: 'id', autoIncrement: true });
      }

      // 4. Cached key-value settings
      if (!db.objectStoreNames.contains('settings_cache')) {
        db.createObjectStore('settings_cache', { keyPath: 'key' });
      }

      // 5. Cached dashboard data
      if (!db.objectStoreNames.contains('dashboard_cache')) {
        db.createObjectStore('dashboard_cache', { keyPath: 'key' });
      }

      // 6. Cached recent print jobs
      if (!db.objectStoreNames.contains('print_jobs_cache')) {
        db.createObjectStore('print_jobs_cache', { keyPath: 'id' });
      }

      // 7. Offline party creations queue (outbox)
      if (!db.objectStoreNames.contains('offline_parties')) {
        db.createObjectStore('offline_parties', { keyPath: 'client_uuid' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

import initialPartiesData from './initialPartiesData.json';

const BUNDLED_PARTIES: Party[] = (initialPartiesData as any[]) || [];

// -------------------------------------------------------------
// Parties Offline Cache & Auto-Seeding
// -------------------------------------------------------------

export async function ensureInitialPartiesLoaded(): Promise<number> {
  try {
    const db = await openEnvelopeDB();
    return new Promise((resolve) => {
      const tx = db.transaction('parties', 'readwrite');
      const store = tx.objectStore('parties');
      const countReq = store.count();

      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count < BUNDLED_PARTIES.length) {
          console.log(`Seeding IndexedDB with ${BUNDLED_PARTIES.length} bundled parties...`);
          for (const p of BUNDLED_PARTIES) {
            if (p.id) {
              store.put(p);
            }
          }
          resolve(BUNDLED_PARTIES.length);
        } else {
          resolve(count);
        }
      };

      countReq.onerror = () => resolve(BUNDLED_PARTIES.length);
    });
  } catch (err) {
    console.warn('ensureInitialPartiesLoaded error:', err);
    return BUNDLED_PARTIES.length;
  }
}

export async function cachePartiesOffline(parties: Party[]): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('parties', 'readwrite');
    const store = tx.objectStore('parties');
    for (const p of parties) {
      if (p.id) {
        store.put(p);
      }
    }
  } catch (err) {
    console.warn('Failed to cache parties offline:', err);
  }
}

export async function updatePartyInOfflineCache(party: Party): Promise<void> {
  if (party.id) {
    await cachePartiesOffline([party]);
  }
}

export async function getAllOfflineParties(): Promise<Party[]> {
  try {
    const db = await openEnvelopeDB();
    return new Promise((resolve) => {
      const tx = db.transaction('parties', 'readonly');
      const store = tx.objectStore('parties');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        if (list.length === 0 && BUNDLED_PARTIES.length > 0) {
          // Immediately trigger background seed
          cachePartiesOffline(BUNDLED_PARTIES).catch(() => {});
          resolve(BUNDLED_PARTIES);
        } else {
          resolve(list);
        }
      };
      request.onerror = () => resolve(BUNDLED_PARTIES);
    });
  } catch {
    return BUNDLED_PARTIES;
  }
}

export async function getPartiesOffline(params: {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  city?: string;
  status?: string;
  letter?: string;
  route?: string;
}): Promise<{
  items: Party[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  states: string[];
  cities: string[];
}> {
  const all = await getAllOfflineParties();
  const searchQ = (params.search || '').trim().toUpperCase();
  const stateF = (params.state || '').trim().toUpperCase();
  const cityF = (params.city || '').trim().toUpperCase();
  const statusF = (params.status || 'all').toLowerCase();
  const letterF = (params.letter || 'ALL').toUpperCase();
  const routeF = (params.route || '').trim().toUpperCase();

  // Extract unique states & cities from full dataset
  const stateSet = new Set<string>();
  const citySet = new Set<string>();
  for (const p of all) {
    if (p.state) stateSet.add(p.state.trim().toUpperCase());
    if (p.city) citySet.add(p.city.trim().toUpperCase());
  }
  const states = Array.from(stateSet).sort();
  const cities = Array.from(citySet).sort();

  // Filter
  const filtered = all.filter((p) => {
    // Status filter
    if (statusF === 'active' && !p.is_active) return false;
    if (statusF === 'inactive' && p.is_active) return false;

    // State filter
    if (stateF && (p.state || '').trim().toUpperCase() !== stateF) return false;

    // City filter
    if (cityF && (p.city || '').trim().toUpperCase() !== cityF) return false;

    // Route filter
    if (routeF) {
      const rAll = [
        p.route, p.route_1, p.route_2, p.route_3,
        p.route_1_gu, p.route_2_gu, p.route_3_gu
      ].map((r) => (r || '').trim().toUpperCase());
      const hasRoute = rAll.some((r) => r.includes(routeF));
      if (!hasRoute) return false;
    }

    // Letter filter
    if (letterF && letterF !== 'ALL') {
      const firstLetter = (p.party_name || '').trim().toUpperCase().charAt(0);
      if (firstLetter !== letterF) return false;
    }

    // Search query
    if (searchQ) {
      const name = (p.party_name || '').toUpperCase();
      const nameGu = (p.party_name_gu || '').toUpperCase();
      const code = (p.party_code || '').toUpperCase();
      const city = (p.city || '').toUpperCase();
      const addr = (p.address || '').toUpperCase();
      const mob = (p.mobile_no || '').toUpperCase();
      const rt = (p.route || '').toUpperCase();
      const r1 = (p.route_1 || '').toUpperCase();
      const r2 = (p.route_2 || '').toUpperCase();
      const r3 = (p.route_3 || '').toUpperCase();
      const r1g = (p.route_1_gu || '').toUpperCase();
      const r2g = (p.route_2_gu || '').toUpperCase();
      const r3g = (p.route_3_gu || '').toUpperCase();

      const matched =
        name.includes(searchQ) ||
        nameGu.includes(searchQ) ||
        code.includes(searchQ) ||
        city.includes(searchQ) ||
        addr.includes(searchQ) ||
        mob.includes(searchQ) ||
        rt.includes(searchQ) ||
        r1.includes(searchQ) ||
        r2.includes(searchQ) ||
        r3.includes(searchQ) ||
        r1g.includes(searchQ) ||
        r2g.includes(searchQ) ||
        r3g.includes(searchQ);

      if (!matched) return false;
    }

    return true;
  });

  // Sort alphabetically by party_name
  filtered.sort((a, b) => (a.party_name || '').localeCompare(b.party_name || ''));

  const total = filtered.length;
  const page = Math.max(1, params.page || 1);
  const limit = params.limit === -1 ? total : (params.limit || 25);
  const pages = limit > 0 ? Math.ceil(total / limit) || 1 : 1;

  const start = limit === -1 ? 0 : (page - 1) * limit;
  const items = limit === -1 ? filtered : filtered.slice(start, start + limit);

  return {
    items,
    total,
    page,
    limit,
    pages,
    states,
    cities,
  };
}

export async function searchPartiesOffline(query: string = '', limit: number = 30): Promise<Party[]> {
  const cleanQ = query.trim().toUpperCase();
  const all = await getAllOfflineParties();

  if (!cleanQ) {
    return all.slice(0, limit);
  }

  const results: Party[] = [];
  for (const p of all) {
    const name = (p.party_name || '').toUpperCase();
    const nameGu = (p.party_name_gu || '').toUpperCase();
    const city = (p.city || '').toUpperCase();
    const addr = (p.address || '').toUpperCase();
    const code = (p.party_code || '').toUpperCase();

    if (
      name.includes(cleanQ) ||
      nameGu.includes(cleanQ) ||
      city.includes(cleanQ) ||
      addr.includes(cleanQ) ||
      code.includes(cleanQ)
    ) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }

  return results;
}

// -------------------------------------------------------------
// Offline Jobs Outbox Queue
// -------------------------------------------------------------

export async function queueOfflineJob(jobData: any): Promise<void> {
  const db = await openEnvelopeDB();
  const tx = db.transaction('offline_jobs', 'readwrite');
  const store = tx.objectStore('offline_jobs');
  const record = {
    ...jobData,
    client_uuid: jobData.client_uuid || `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queued_at: new Date().toISOString()
  };
  store.put(record);
}

export async function getQueuedOfflineJobs(): Promise<any[]> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_jobs', 'readonly');
    const store = tx.objectStore('offline_jobs');

    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeQueuedOfflineJob(clientUuid: string): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_jobs', 'readwrite');
    tx.objectStore('offline_jobs').delete(clientUuid);
  } catch (err) {
    console.warn('Failed to delete synced offline job:', err);
  }
}

// -------------------------------------------------------------
// Offline Proof of Delivery Outbox Queue
// -------------------------------------------------------------

export async function queueOfflinePOD(pod: PODSubmission): Promise<void> {
  const db = await openEnvelopeDB();
  const tx = db.transaction('offline_pods', 'readwrite');
  const store = tx.objectStore('offline_pods');
  store.add({
    ...pod,
    queued_at: new Date().toISOString()
  });
}

export async function getQueuedOfflinePODs(): Promise<any[]> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_pods', 'readonly');
    const store = tx.objectStore('offline_pods');

    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeQueuedOfflinePOD(id: number): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_pods', 'readwrite');
    tx.objectStore('offline_pods').delete(id);
  } catch (err) {
    console.warn('Failed to delete synced offline POD:', err);
  }
}

// -------------------------------------------------------------
// Offline Party Creations & GPS Auto-Save Queue
// -------------------------------------------------------------

export async function deletePartyFromOfflineCache(id: number): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('parties', 'readwrite');
    tx.objectStore('parties').delete(id);
  } catch (err) {
    console.warn('Failed to delete party from offline cache:', err);
  }
}

export async function queueOfflineParty(party: Party): Promise<void> {
  const db = await openEnvelopeDB();
  const tx = db.transaction('offline_parties', 'readwrite');
  const store = tx.objectStore('offline_parties');
  const record = {
    ...party,
    client_uuid: party.client_uuid || `offline-party-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queued_at: new Date().toISOString(),
  };
  store.put(record);
}

export async function getQueuedOfflineParties(): Promise<any[]> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_parties', 'readonly');
    const store = tx.objectStore('offline_parties');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeQueuedOfflineParty(clientUuid: string): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('offline_parties', 'readwrite');
    tx.objectStore('offline_parties').delete(clientUuid);
  } catch (err) {
    console.warn('Failed to remove queued offline party:', err);
  }
}

export async function savePartyOffline(party: Party): Promise<Party> {
  const tempId = party.id || -Date.now();
  const clientUuid = party.client_uuid || `offline-party-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const offlineParty: Party = {
    ...party,
    id: tempId,
    client_uuid: clientUuid,
  };

  // 1. Immediately store in local parties IndexedDB so it's searchable and visible offline
  const db = await openEnvelopeDB();
  const tx = db.transaction('parties', 'readwrite');
  tx.objectStore('parties').put(offlineParty);

  // 2. Queue for background cloud sync
  await queueOfflineParty(offlineParty);

  return offlineParty;
}

export async function getPendingSyncCount(): Promise<number> {
  try {
    const jobs = await getQueuedOfflineJobs();
    const pods = await getQueuedOfflinePODs();
    const parties = await getQueuedOfflineParties();
    return jobs.length + pods.length + parties.length;
  } catch {
    return 0;
  }
}

// -------------------------------------------------------------
// Dashboard & Print Jobs Instant Caching
// -------------------------------------------------------------

export async function getCachedDashboardData(): Promise<any | null> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('dashboard_cache', 'readonly');
    const store = tx.objectStore('dashboard_cache');
    return new Promise((resolve) => {
      const req = store.get('latest_dashboard');
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedDashboardData(data: any): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('dashboard_cache', 'readwrite');
    const store = tx.objectStore('dashboard_cache');
    store.put({ key: 'latest_dashboard', data, updated_at: new Date().toISOString() });
  } catch (err) {
    console.warn('Failed to cache dashboard data:', err);
  }
}

export async function getCachedPrintJobs(): Promise<any[]> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('print_jobs_cache', 'readonly');
    const store = tx.objectStore('print_jobs_cache');
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function setCachedPrintJobs(jobs: any[]): Promise<void> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('print_jobs_cache', 'readwrite');
    const store = tx.objectStore('print_jobs_cache');
    for (const job of jobs) {
      if (job.id) {
        store.put(job);
      }
    }
  } catch (err) {
    console.warn('Failed to cache print jobs:', err);
  }
}
