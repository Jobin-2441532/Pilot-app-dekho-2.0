import os
import sys
from dotenv import load_dotenv

# Load database URL from .env instead of hardcoding
load_dotenv(".env")

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://dekho:dekho_password@localhost:5432/dekho_pilot"

# Import engine AFTER setting the environment variable so it picks it up
from app.core.database import engine, Base

print("🚀 Connecting to Neon PostgreSQL...")
Base.metadata.create_all(bind=engine)
print("✅ All tables created successfully in Neon database!")
