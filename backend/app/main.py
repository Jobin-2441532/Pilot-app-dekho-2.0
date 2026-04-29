import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

from app.core.config import settings
from app.core.logging_config import logger
from app.core.rate_limit import limiter
from app.api.endpoints import chat, dashboard, ingestion, features, auth, jobs, feedback
from app.services.retriever import retriever
from app.services.storage import storage_service
from contextlib import asynccontextmanager

load_dotenv()

# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Dekho API",
    description="Backend for Dekho — a habit-first personal finance companion",
    version="0.1.0",
    lifespan=lifespan,
    # Disable default /docs and /redoc in production via env var
    docs_url="/docs" if os.getenv("ENV", "development") != "production" else None,
    redoc_url=None,
)

# Attach rate limiter to the app
app.state.limiter = limiter

# ---------------------------------------------------------------------------
# Rate-limit error handler — returns JSON 429 instead of HTML
# ---------------------------------------------------------------------------
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(f"Rate limit exceeded: {request.client.host} {request.url.path}")
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down and try again shortly."},
    )

# ---------------------------------------------------------------------------
# CORS — tightened to known frontend origins only
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Request-ID"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
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
        },
    }

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(ingestion.router, prefix="/api/v1/ingest", tags=["ingestion"])
app.include_router(features.router, prefix="/api/v1/features", tags=["features"])
app.include_router(feedback.router, prefix="/api/v1/feedback", tags=["feedback"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
