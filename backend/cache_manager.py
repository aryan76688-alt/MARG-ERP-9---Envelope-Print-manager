import time
import hashlib
import json
import threading
from typing import Any, Optional, Dict

class MemoryCacheManager:
    """
    High-performance thread-safe in-memory cache.
    Prevents database heating and excessive CPU usage by caching frequent queries
    (parties list, routes, autocomplete, next code) and invalidating on write.
    """
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._version = int(time.time() * 1000)

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    def bump_version(self) -> int:
        """Increments version when parties change, invalidating client-side caches."""
        with self._lock:
            self._version = int(time.time() * 1000)
            # Clear party-related cache keys
            keys_to_del = [k for k in self._cache if k.startswith("parties:")]
            for k in keys_to_del:
                del self._cache[k]
            return self._version

    def get(self, key: str) -> Optional[Any]:
        now = time.time()
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            if entry["expires_at"] < now:
                del self._cache[key]
                return None
            return entry["data"]

    def set(self, key: str, data: Any, ttl_seconds: float = 30.0) -> None:
        now = time.time()
        with self._lock:
            self._cache[key] = {
                "data": data,
                "expires_at": now + ttl_seconds
            }

    def delete(self, key: str) -> None:
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def clear_prefix(self, prefix: str) -> None:
        with self._lock:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

    def get_etag(self, extra_salt: str = "") -> str:
        """Returns ETag string derived from current dataset version."""
        raw = f"v_{self._version}_{extra_salt}"
        return f'"{hashlib.md5(raw.encode()).hexdigest()}"'

# Singleton instance
cache_mgr = MemoryCacheManager()
