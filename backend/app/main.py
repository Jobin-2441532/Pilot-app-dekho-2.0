import os
from fastapi import FastAPI, Request, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

from app.core.config import settings
from app.core.logging_config import logger
from app.core.rate_limit import limiter
from app.api.endpoints import chat, dashboard, ingestion, features, auth, jobs, feedback, insights, ml_proxy, csv_import, home, expenses, admin, notifications, push, config
from app.services.retriever import retriever
from app.core.database import get_db
from app.services.storage import storage_service
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager

load_dotenv()

# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Dekho API...")
    # Ensure all DB tables exist on every startup (safe: CREATE TABLE IF NOT EXISTS)
    from app.core.database import init_db
    from app.tasks.notification_engine import start_scheduler
    
    db_url = settings.DATABASE_URL
    db_type = "postgres" if "postgresql" in db_url else "sqlite"
    logger.info(f"DATABASE TYPE: {db_type} | URL starts with: {db_url[:40]}")
    
    init_db()
    logger.info("Database tables ready (Neon warmup complete).")
    
    scheduler = start_scheduler()
    logger.info("APScheduler started.")
    
    logger.info(f"MinIO available: {storage_service.is_available()}")
    yield
    scheduler.shutdown()
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
    "http://192.168.1.11:5173",
    "https://dekho.vercel.app",
    "https://dekho-app.vercel.app",
    "https://dekhoapp.vercel.app",
    "https://dekhofin.vercel.app",
]

# Allow custom domain from env var if provided
env_origin = os.getenv("FRONTEND_ORIGIN")
if env_origin and env_origin not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(env_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Admin-User", "X-Admin-Pass"],
    expose_headers=["X-Request-ID"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
import httpx
from starlette.responses import StreamingResponse

@app.api_route("/api/chat/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], tags=["chat_proxy"])
async def chatbot_proxy(request: Request, path: str):
    url = f"http://127.0.0.1:8002/api/chat/{path}"
    query = request.url.query
    if query:
        url += f"?{query}"

    client = httpx.AsyncClient(timeout=120.0)
    req = client.build_request(
        request.method,
        url,
        headers=request.headers.raw,
        content=await request.body()
    )
    
    r = await client.send(req, stream=True)
    
    async def stream_generator():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()
            
    return StreamingResponse(
        stream_generator(),
        status_code=r.status_code,
        headers={k: v for k, v in r.headers.items() if k.lower() not in ("content-length", "transfer-encoding", "content-encoding") and not k.lower().startswith("access-control-")}
    )

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to Ask Dekho API", "version": "0.1.0"}


@app.head("/health", tags=["health"])
async def health_head():
    return Response(status_code=200)

@app.get("/health", tags=["health"])
async def health(db: Session = Depends(get_db)):
    """Enhanced health check — reports status of all backend services including DB."""
    db_status = "ok"
    db_error = None
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "unavailable"
        db_error = str(e)
        
    db_url = settings.DATABASE_URL
    db_type = "postgres" if "postgresql" in db_url else "sqlite"
    return {
        "status": "healthy" if db_status == "ok" else "unhealthy",
        "services": {
            "api": "ok",
            "database": db_status,
            "db_type": db_type,
            "db_error": db_error,
            "minio": "ok" if storage_service.is_available() else "unavailable",
        },
    }

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(ingestion.router, prefix="/api/v1/ingest", tags=["ingestion"])
app.include_router(features.router, prefix="/api/v1/features", tags=["features"])
app.include_router(feedback.router,  prefix="/api/v1/feedback",  tags=["feedback"])
app.include_router(jobs.router,      prefix="/api/v1/jobs",      tags=["jobs"])
app.include_router(insights.router,  prefix="/api/v1/insights",  tags=["insights"])
app.include_router(ml_proxy.router,   prefix="/api/v1/ml",     tags=["ml"])
app.include_router(csv_import.router, prefix="/api/v1/import", tags=["import"])
app.include_router(home.router, prefix="/api/home", tags=["home"])
app.include_router(expenses.router, prefix="/api/v1/expenses", tags=["expenses"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(push.router, prefix="/api/v1/push", tags=["push"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
