"""Thread store backing share links, on Postgres via SQLAlchemy."""

import re
import time
import uuid

from backend.db import session_scope
from backend.models import Thread

MAX_TURNS = 50
MAX_QUERY_CHARS = 2000
MAX_ANSWER_CHARS = 20000
MAX_SOURCES_PER_TURN = 10

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def valid_id(thread_id: str) -> bool:
    return bool(ID_RE.match(thread_id))


def clean_turns(turns) -> list[dict] | None:
    """Validate and trim client-supplied turns. None means invalid."""
    if not isinstance(turns, list) or not turns or len(turns) > MAX_TURNS:
        return None
    clean: list[dict] = []
    for turn in turns:
        if not isinstance(turn, dict):
            return None
        query = turn.get("query")
        answer = turn.get("answer")
        if not isinstance(query, str) or not query.strip():
            return None
        if not isinstance(answer, str):
            return None
        raw_sources = turn.get("sources") or []
        if not isinstance(raw_sources, list):
            return None
        sources: list[dict] = []
        for src in raw_sources[:MAX_SOURCES_PER_TURN]:
            if (
                isinstance(src, dict)
                and isinstance(src.get("id"), int)
                and isinstance(src.get("title"), str)
                and isinstance(src.get("url"), str)
            ):
                sources.append(
                    {
                        "id": src["id"],
                        "title": src["title"][:300],
                        "url": src["url"][:2000],
                        "excerpt": str(src.get("excerpt") or "")[:300],
                    }
                )
        clean.append(
            {
                "query": query[:MAX_QUERY_CHARS],
                "answer": answer[:MAX_ANSWER_CHARS],
                "sources": sources,
            }
        )
    return clean


def save_thread(
    thread_id: str, title: str, turns: list[dict], user_id: uuid.UUID | None = None
) -> str:
    """Upsert a thread. Returns "forbidden" when owned by someone else."""
    with session_scope() as session:
        row = session.get(Thread, thread_id)
        if row is None:
            session.add(
                Thread(
                    id=thread_id,
                    user_id=user_id,
                    title=title[:200],
                    turns=turns,
                    updated_at=time.time(),
                )
            )
            return "ok"
        if row.user_id is not None and row.user_id != user_id:
            return "forbidden"
        row.title = title[:200]
        row.turns = turns
        row.updated_at = time.time()
        if row.user_id is None:
            row.user_id = user_id
        return "ok"


def get_thread(thread_id: str) -> dict | None:
    with session_scope() as session:
        row = session.get(Thread, thread_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "title": row.title,
            "turns": row.turns,
            "updated_at": row.updated_at,
        }


def delete_thread(thread_id: str, user_id: uuid.UUID | None = None) -> str:
    """Delete a thread. Returns "forbidden" when owned by someone else."""
    with session_scope() as session:
        row = session.get(Thread, thread_id)
        if row is None:
            return "ok"
        if row.user_id is not None and row.user_id != user_id:
            return "forbidden"
        session.delete(row)
        return "ok"
