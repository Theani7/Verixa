"""Small in-process TTL cache for completed answers.

Purpose: repeat questions (same normalized query, mode, profile) return
instantly instead of re-running Exa + Groq. First-turn questions only —
history-dependent follow-ups are never cached.

Privacy: incognito requests bypass the cache entirely, so private answers
are never written or served from it.
"""

import hashlib
import json
import time
from collections import OrderedDict

_TTL_SECONDS = 300
_MAX_ENTRIES = 256

_cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()


def _profile_digest(profile: dict) -> str:
    try:
        blob = json.dumps(profile, sort_keys=True, default=str)
    except Exception:
        blob = ""
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def make_key(
    query: str,
    mode: str,
    profile: dict,
    num_results: int | None,
    history: list,
) -> tuple | None:
    """Cache key, or None when the request must not be cached."""
    if history:
        return None
    normalized = " ".join(query.lower().split())
    if not normalized:
        return None
    return (normalized, mode, _profile_digest(profile or {}), num_results or 0)


def get(key: tuple | None) -> dict | None:
    if key is None:
        return None
    item = _cache.get(key)
    if item is None:
        return None
    expires, value = item
    if time.time() >= expires:
        _cache.pop(key, None)
        return None
    _cache.move_to_end(key)
    return value


def put(key: tuple | None, value: dict) -> None:
    if key is None:
        return
    _cache[key] = (time.time() + _TTL_SECONDS, value)
    _cache.move_to_end(key)
    while len(_cache) > _MAX_ENTRIES:
        _cache.popitem(last=False)


def clear() -> None:
    _cache.clear()
