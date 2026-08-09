from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# ── Build async DATABASE_URL ──────────────────────────────────────────────────
# Convert mysql+pymysql:// → mysql+aiomysql:// for async support.
# All other parts of the URL (host, port, user, password, db name) stay the same.
_raw_url: str = settings.DATABASE_URL
if _raw_url.startswith("mysql+pymysql://"):
    ASYNC_DATABASE_URL = _raw_url.replace("mysql+pymysql://", "mysql+aiomysql://", 1)
elif _raw_url.startswith("mysql://"):
    ASYNC_DATABASE_URL = _raw_url.replace("mysql://", "mysql+aiomysql://", 1)
else:
    # Already using aiomysql or another dialect — use as-is
    ASYNC_DATABASE_URL = _raw_url

# ── Async Engine tuned for 35 concurrent students ─────────────────────────────
# pool_size=20   : keep 20 connections always open and ready
# max_overflow=15: allow up to 35 total connections during peak load (20+15)
# pool_timeout=30: wait up to 30s for a free connection before raising an error
# pool_recycle   : recycle stale connections every 30 minutes (prevents MySQL
#                  "gone away" errors from the default 8h idle timeout)
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=20,
    max_overflow=15,
    pool_timeout=30,
    pool_recycle=1800,
    echo=False,          # set True temporarily to log SQL queries while debugging
)

# expire_on_commit=False: keeps ORM objects accessible after commit inside async routes
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    """FastAPI dependency that yields an async SQLAlchemy session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
