import psycopg2

conn = psycopg2.connect('postgresql://neondb_owner:npg_rHAIGblk07Df@ep-summer-mud-atfpwmeo-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require')
cur = conn.cursor()

cur.execute('SELECT session_id FROM chat_sessions;')
sessions = cur.fetchall()
print(f'Found {len(sessions)} sessions')

updated_count = 0
for (session_id,) in sessions:
    cur.execute('''
        SELECT content FROM conversations 
        WHERE session_id = %s AND role = 'user' 
        ORDER BY timestamp ASC LIMIT 1
    ''', (session_id,))
    result = cur.fetchone()
    
    if result:
        content = result[0]
        # Make a glance of the first message
        title = content[:35] + '...' if len(content) > 35 else content
        # Remove newlines just in case
        title = title.replace('\n', ' ').strip()
        
        cur.execute('''
            UPDATE chat_sessions 
            SET title = %s 
            WHERE session_id = %s
        ''', (title, session_id))
        updated_count += 1
    else:
        # Fallback to assistant message if no user message
        cur.execute('''
            SELECT content FROM conversations 
            WHERE session_id = %s 
            ORDER BY timestamp ASC LIMIT 1
        ''', (session_id,))
        res2 = cur.fetchone()
        if res2:
            content = res2[0]
            title = content[:35] + '...' if len(content) > 35 else content
            title = title.replace('\n', ' ').strip()
            cur.execute('''
                UPDATE chat_sessions 
                SET title = %s 
                WHERE session_id = %s
            ''', (title, session_id))
            updated_count += 1

conn.commit()
print(f'Updated {updated_count} titles successfully!')
