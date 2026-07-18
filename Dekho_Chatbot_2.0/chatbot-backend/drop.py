import asyncio  
from app.services.db_pool import init_pool, close_pool  
from app.services.db_store import _get_conn, init_db  
async def main():  
    await init_pool()  
    async with _get_conn() as conn:  
        await conn.execute('DROP TABLE IF EXISTS chat_sessions CASCADE')  
    await init_db()  
    await close_pool()  
asyncio.run(main())  
