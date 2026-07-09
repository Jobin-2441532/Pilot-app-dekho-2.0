import os
from dotenv import load_dotenv
load_dotenv()
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()
users = db.query(User).all()
for u in users:
    print(f'User: ''{u.email}'', hash_present: {bool(u.password_hash)}')

