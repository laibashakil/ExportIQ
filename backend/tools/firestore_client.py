"""Thin wrapper over Firestore.

When Firebase credentials are not configured we fall back to an in-memory
dict-backed store. This is essential so the demo (and tests) can run without
a real Firebase project — but every write/read API mirrors what Firestore
gives us in production.
"""
from __future__ import annotations

import logging
import threading
from copy import deepcopy
from datetime import datetime
from typing import Any

from config import get_settings

log = logging.getLogger("exportiq.firestore")

_firestore_client = None
_init_lock = threading.Lock()


def _init_real_client():
    """Initialise firebase-admin lazily."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    settings = get_settings()
    if not firebase_admin._apps:
        if settings.firebase_credentials:
            cred = credentials.Certificate(settings.firebase_credentials)
            firebase_admin.initialize_app(cred, {
                "projectId": settings.firebase_project_id,
                "storageBucket": settings.firebase_storage_bucket,
            })
        else:
            firebase_admin.initialize_app(options={
                "projectId": settings.firebase_project_id,
            })
    return firestore.client()


# ────────────────────────────────────────────────────────────────────────────
# In-memory fallback
# ────────────────────────────────────────────────────────────────────────────


class _MemStore:
    """Minimal in-memory Firestore-compatible store used when no creds available."""

    def __init__(self) -> None:
        self._data: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._listeners: dict[str, list] = {}

    def _key(self, path: str) -> str:
        return path.strip("/")

    def set(self, path: str, value: dict, merge: bool = False) -> None:
        with self._lock:
            key = self._key(path)
            if merge and key in self._data:
                self._data[key].update(value)
            else:
                self._data[key] = deepcopy(value)
        self._fire(path)

    def get(self, path: str) -> dict | None:
        with self._lock:
            return deepcopy(self._data.get(self._key(path)))

    def update(self, path: str, patch: dict) -> None:
        self.set(path, patch, merge=True)

    def append_to_array(self, path: str, field: str, item: Any) -> None:
        with self._lock:
            doc = self._data.setdefault(self._key(path), {})
            arr = doc.setdefault(field, [])
            arr.append(deepcopy(item))
        self._fire(path)

    def list_collection(self, collection: str) -> list[dict]:
        prefix = self._key(collection) + "/"
        with self._lock:
            return [
                deepcopy(v) | {"_id": k.rsplit("/", 1)[-1]}
                for k, v in self._data.items()
                if k.startswith(prefix) and "/" not in k[len(prefix):]
            ]

    def _fire(self, path: str) -> None:
        for prefix, cbs in self._listeners.items():
            if path.startswith(prefix):
                for cb in cbs:
                    try:
                        cb(path, self.get(path))
                    except Exception:  # noqa: BLE001
                        log.exception("listener error for %s", path)


_mem = _MemStore()


# ────────────────────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────────────────────


def _client():
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client
    with _init_lock:
        if _firestore_client is not None:
            return _firestore_client
        settings = get_settings()
        if settings.has_real_firebase:
            try:
                _firestore_client = _init_real_client()
                log.info("Firestore: using real Firebase project %s", settings.firebase_project_id)
            except Exception:  # noqa: BLE001
                log.exception("Failed to init Firebase; falling back to in-memory store")
                _firestore_client = _mem
        else:
            log.warning("Firestore: no credentials — using in-memory store")
            _firestore_client = _mem
    return _firestore_client


def set_doc(path: str, value: dict, merge: bool = False) -> None:
    client = _client()
    if client is _mem:
        _mem.set(path, value, merge=merge)
        return
    ref = client.document(path)
    if merge:
        ref.set(value, merge=True)
    else:
        ref.set(value)


def get_doc(path: str) -> dict | None:
    client = _client()
    if client is _mem:
        return _mem.get(path)
    snap = client.document(path).get()
    return snap.to_dict() if snap.exists else None


def update_doc(path: str, patch: dict) -> None:
    set_doc(path, patch, merge=True)


def append_trace(job_id: str, entry: dict) -> None:
    """Append a single reasoning step to /jobs/{job_id}/agent_trace.

    Agents call this on every meaningful action so the mobile AgentTraceScreen
    streams the chain-of-thought to the judges live.
    """
    entry = {"ts": datetime.utcnow().isoformat(), **entry}
    client = _client()
    if client is _mem:
        _mem.append_to_array(f"jobs/{job_id}", "agent_trace", entry)
        return
    from google.cloud.firestore_v1 import ArrayUnion
    client.document(f"jobs/{job_id}").set(
        {"agent_trace": ArrayUnion([entry])}, merge=True
    )


def list_collection(path: str) -> list[dict]:
    client = _client()
    if client is _mem:
        return _mem.list_collection(path)
    return [doc.to_dict() | {"_id": doc.id} for doc in client.collection(path).stream()]


def update_compliance_score(factory_id: str, score: int, risk_level: str, orders_at_risk_pkr: int) -> None:
    """Write the **real** compliance state to /factories/{id}.

    This is the source of truth the mobile HomeScreen and ComplianceScreen
    gauges read. Only the gap_detection / financial_impact agents (i.e. the
    agents that observe the factory's actual state) may call this — the
    execution_simulation agent must use update_simulated_score() instead so
    its what-if results never overwrite the live score.
    """
    update_doc(f"factories/{factory_id}", {
        "compliance_score": score,
        "risk_level": risk_level,
        "orders_at_risk_pkr": orders_at_risk_pkr,
        "updated_at": datetime.utcnow().isoformat(),
    })


def update_simulated_score(factory_id: str, score: int, risk_level: str, orders_at_risk_pkr: int) -> None:
    """Write what-if simulation output to /factories/{id} on **separate** fields.

    SIMULATION ONLY — never overwrites the real compliance_score. Mobile
    screens that want to surface "post-fix preview" UX read these mirrored
    `simulated_*` fields explicitly; the main score gauge reads
    `compliance_score` and must never fall back to these.
    """
    update_doc(f"factories/{factory_id}", {
        "simulated_compliance_score": score,
        "simulated_risk_level": risk_level,
        "simulated_orders_at_risk_pkr": orders_at_risk_pkr,
        "simulated_updated_at": datetime.utcnow().isoformat(),
    })


def update_job_progress(job_id: str, *, status: str | None = None,
                       progress: int | None = None,
                       current_agent: str | None = None) -> None:
    patch: dict = {"updated_at": datetime.utcnow().isoformat()}
    if status is not None:
        patch["status"] = status
    if progress is not None:
        patch["progress"] = progress
    if current_agent is not None:
        patch["current_agent"] = current_agent
    update_doc(f"jobs/{job_id}", patch)
