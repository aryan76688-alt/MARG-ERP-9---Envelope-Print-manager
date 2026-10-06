import { useState, useEffect, useCallback } from 'react';
import { 
  getQueuedOfflineJobs, 
  removeQueuedOfflineJob, 
  getQueuedOfflinePODs, 
  removeQueuedOfflinePOD, 
  getPendingSyncCount,
  cachePartiesOffline 
} from './db';
import { syncBatchPrintJobs, syncBatchPOD, fetchParties } from '../api/client';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

// Background sync function
export async function syncPendingQueues(): Promise<{ syncedJobs: number; syncedPods: number }> {
  if (!navigator.onLine) {
    return { syncedJobs: 0, syncedPods: 0 };
  }

  let syncedJobs = 0;
  let syncedPods = 0;

  try {
    // 1. Sync Print Jobs
    const queuedJobs = await getQueuedOfflineJobs();
    if (queuedJobs.length > 0) {
      // Chunk in batches of 20
      const batchSize = 20;
      for (let i = 0; i < queuedJobs.length; i += batchSize) {
        const chunk = queuedJobs.slice(i, i + batchSize);
        try {
          const res = await syncBatchPrintJobs(chunk);
          if (res.success) {
            for (const item of chunk) {
              if (item.client_uuid) {
                await removeQueuedOfflineJob(item.client_uuid);
                syncedJobs++;
              }
            }
          }
        } catch (e) {
          console.warn('Batch print jobs sync error:', e);
          break; // Stop trying subsequent chunks if server is unreachable
        }
      }
    }

    // 2. Sync Proof of Delivery (POD)
    const queuedPods = await getQueuedOfflinePODs();
    if (queuedPods.length > 0) {
      try {
        const res = await syncBatchPOD(queuedPods);
        if (res.success) {
          for (const pod of queuedPods) {
            if (pod.id) {
              await removeQueuedOfflinePOD(pod.id);
              syncedPods++;
            }
          }
        }
      } catch (e) {
        console.warn('Batch POD sync error:', e);
      }
    }

    // 3. Opportunistically warm up local parties cache if empty or stale
    try {
      const partiesRes = await fetchParties({ page: 1, limit: 1000 });
      if (partiesRes.items && partiesRes.items.length > 0) {
        await cachePartiesOffline(partiesRes.items);
      }
    } catch {
      // Ignore background cache failure
    }

  } catch (err) {
    console.warn('Sync runner error:', err);
  }

  return { syncedJobs, syncedPods };
}

// Custom React Hook
export function useNetworkSync(): SyncStatus {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingSyncCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      await syncPendingQueues();
      setLastSyncedAt(new Date());
    } finally {
      await refreshPendingCount();
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshPendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds
    const interval = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) {
        triggerSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount, triggerSync]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncedAt,
    triggerSync,
    refreshPendingCount,
  };
}
