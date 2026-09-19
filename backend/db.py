"""Database engine and session handling.

DATABASE_URL selects the backend. Local default is the Homebrew Postgres
database; pointing it at Neon/Supabase/RDS is all it takes to move hosts.
"""

import os
from collections.abc import Iterator
from contextlib import contextmanager

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from backend.config import settings

DATABASE_URL = settings.database_url


engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

Base = declarative_base()


def init_db() -> None:
    """Create extension and tables. Safe to run on every startup."""
    from backend import models  # noqa: F401 — register models first

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        # Added after launch; harmless on fresh databases.
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120) DEFAULT ''"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30)"))
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)")
        )
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN DEFAULT TRUE")
        )
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_auto BOOLEAN DEFAULT TRUE")
        )


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
