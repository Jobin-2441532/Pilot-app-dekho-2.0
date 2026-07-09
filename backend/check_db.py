import os
from dotenv import load_dotenv
load_dotenv()
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()
users = db.query(User).all()
print(f'Found {len(users)} users:')
for u in users:
    print(f'- {u.email}')

