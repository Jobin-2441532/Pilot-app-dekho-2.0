from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.core.config import settings
from app.core.logging_config import logger
from app.api.endpoints import chat, dashboard, ingestion, features, auth, jobs, feedback
from app.services.retriever import retriever
from app.services.storage import storage_service
from contextlib import asynccontextmanager

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Dekho API...")
    logger.info("Pre-loading FAISS Database into memory...")
    if not retriever.is_ready:
        retriever.load()
    logger.info("FAISS Initialized!")
    logger.info(f"MinIO available: {storage_service.is_available()}")
    yield
    logger.info("Dekho API shutting down.")

app = FastAPI(
    title="Dekho API",
    description="Backend for Dekho — a habit-first personal finance companion",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to Ask Dekho API", "version": "0.1.0"}


@app.get("/health", tags=["health"])
async def health():
    """Enhanced health check — reports status of all backend services."""
    return {
        "status": "healthy",
        "services": {
            "api": "ok",
            "minio": "ok" if storage_service.is_available() else "unavailable",
        }
    }

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(ingestion.router, prefix="/api/v1/ingest", tags=["ingestion"])
app.include_router(features.router, prefix="/api/v1/features", tags=["features"])
app.include_router(feedback.router, prefix="/api/v1/feedback", tags=["feedback"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])

