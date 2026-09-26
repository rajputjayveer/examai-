import asyncio
from sqlalchemy import text
from app.db.base import engine

async def migrate():
    async with engine.begin() as conn:
        # MySQL: check INFORMATION_SCHEMA for column existence
        result = await conn.execute(text("""
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'attendance_sessions'
            AND COLUMN_NAME = 'subject_name'
        """))
        exists = result.scalar()
        if not exists:
            await conn.execute(text(
                "ALTER TABLE attendance_sessions ADD COLUMN subject_name VARCHAR(128) NULL"
            ))
            print("Column subject_name added successfully.")
        else:
            print("Column subject_name already exists.")

asyncio.run(migrate())
