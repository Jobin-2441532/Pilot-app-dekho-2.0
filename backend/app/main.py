from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from dotenv import load_dotenv
import os

from app.core.config import settings
from app.api.endpoints import chat, dashboard, ingestion, features
from app.services.retriever import retriever
from contextlib import asynccontextmanager

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Execute heavy FAISS initialization when the server boots
    print("Pre-loading FAISS Database into memory...")
    if not retriever.is_ready:
        retriever.load()
    print("FAISS Initialized!")
    yield

app = FastAPI(
    title="Dekho API",
    description="Backend for Dekho — a habit-first personal finance companion",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"], # Add both Vite default and secondary ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root endpoint for health check
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to Ask Dekho API"}


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}

# Include routers
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(ingestion.router, prefix="/api/v1/ingest", tags=["ingestion"])
app.include_router(features.router, prefix="/api/v1/features", tags=["features"])
