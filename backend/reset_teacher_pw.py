import asyncio
from sqlalchemy import text
from app.db.base import engine
from app.core.security import get_password_hash

async def reset_pw():
    new_hash = get_password_hash('Test1234!')
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET password_hash=:h WHERE email='teacher1@examguard.com'"),
            {'h': new_hash}
        )
        print('Password reset for teacher1@examguard.com to: Test1234!')

asyncio.run(reset_pw())
