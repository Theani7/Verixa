"""Server-side thread store backing share links. SQLite, stdlib only."""

import json
import re
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "verixa.db"

MAX_TURNS = 50
MAX_QUERY_CHARS = 2000
MAX_ANSWER_CHARS = 20000
MAX_SOURCES_PER_TURN = 10

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    turns TEXT NOT NULL,
    updated_at REAL NOT NULL
)
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(_SCHEMA)
    return conn


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


def save_thread(thread_id: str, title: str, turns: list[dict]) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO threads (id, title, turns, updated_at) VALUES (?, ?, ?, ?)"
            " ON CONFLICT(id) DO UPDATE SET title=excluded.title,"
            " turns=excluded.turns, updated_at=excluded.updated_at",
            (thread_id, title[:200], json.dumps(turns), time.time()),
        )


def get_thread(thread_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, title, turns, updated_at FROM threads WHERE id = ?",
            (thread_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "title": row[1],
        "turns": json.loads(row[2]),
        "updated_at": row[3],
    }


def delete_thread(thread_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
