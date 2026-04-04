from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .config import ManagerSettings
from .models import Base


def create_sqlite_engine(settings: ManagerSettings):
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{settings.db_path}",
        future=True,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _connection_record) -> None:  # pragma: no cover
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.close()

    return engine


def create_session_factory(engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_database(engine) -> None:
    Base.metadata.create_all(engine)


def ensure_runtime_indexes(engine) -> None:
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_spectra_class_excluded_axis_file ON spectra (class_key, is_excluded, axis_kind, file_name)",
        "CREATE INDEX IF NOT EXISTS ix_spectra_class_excluded_file ON spectra (class_key, is_excluded, file_name)",
        "CREATE INDEX IF NOT EXISTS ix_spectra_class_component_excluded_file ON spectra (class_key, component_count, is_excluded, file_name)",
        "CREATE INDEX IF NOT EXISTS ix_spectra_excluded_recent ON spectra (is_excluded, excluded_at)",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)


@contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def encode_json(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def decode_json(value: str | None, default):
    if not value:
        return default
    return json.loads(value)
