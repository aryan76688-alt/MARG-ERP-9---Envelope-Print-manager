import { Party, PODSubmission } from '../types';

const DB_NAME = 'MARGEnvelopeDB';
const DB_VERSION = 1;

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

// -------------------------------------------------------------
// Parties Offline Cache
// -------------------------------------------------------------

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

export async function searchPartiesOffline(query: string = '', limit: number = 30): Promise<Party[]> {
  try {
    const db = await openEnvelopeDB();
    const tx = db.transaction('parties', 'readonly');
    const store = tx.objectStore('parties');
    const cleanQ = query.trim().toUpperCase();

    return new Promise((resolve) => {
      const results: Party[] = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          const party = cursor.value as Party;
          const name = (party.party_name || '').toUpperCase();
          const city = (party.city || '').toUpperCase();
          const addr = (party.address || '').toUpperCase();
          const code = (party.party_code || '').toUpperCase();

          if (!cleanQ || name.includes(cleanQ) || city.includes(cleanQ) || addr.includes(cleanQ) || code.includes(cleanQ)) {
            results.push(party);
            if (results.length >= limit) {
              resolve(results);
              return;
            }
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
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

export async function getPendingSyncCount(): Promise<number> {
  try {
    const jobs = await getQueuedOfflineJobs();
    const pods = await getQueuedOfflinePODs();
    return jobs.length + pods.length;
  } catch {
    return 0;
  }
}
