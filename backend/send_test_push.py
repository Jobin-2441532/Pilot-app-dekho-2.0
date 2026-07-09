import os
import json
from dotenv import load_dotenv
load_dotenv()
from app.core.database import SessionLocal
from app.models.notification import PushSubscription
from app.tasks.notification_engine import send_web_push

db = SessionLocal()
subs = db.query(PushSubscription).all()
print(f'Found {len(subs)} subscriptions')
for sub in subs:
    send_web_push(sub, {
        'title': 'Dekho Update',
        'body': 'This is a test notification sent to all users!',
        'url': '/'
    })
print('Done.')

