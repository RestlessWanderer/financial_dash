import os
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////workspace/backend/data/stocks.db")

# Ensure data directory exists
db_path = DATABASE_URL.replace("sqlite:///", "")
os.makedirs(os.path.dirname(db_path), exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db():
    SQLModel.metadata.create_all(engine)
    # Column migrations — safe to run on every startup; each is a no-op if already present
    _migrations = [
        "ALTER TABLE dividendholding ADD COLUMN user_added INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE liquidaccount ADD COLUMN apy REAL",
        "ALTER TABLE etradecredential ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE dividendsnapshot ADD COLUMN beta REAL",
    ]
    with engine.connect() as conn:
        for stmt in _migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists


def get_session():
    with Session(engine) as session:
        yield session
