"""
Database Layer — Neon PostgreSQL persistence for conversations and user preferences.
"""

from __future__ import annotations
import json
import logging
from datetime import datetime
from contextlib import asynccontextmanager
import asyncpg
from app.config import settings
from app.services.db_pool import get_pool

logger = logging.getLogger("dekho.db")

CREATE_CONVERSATIONS = """
CREATE TABLE IF NOT EXISTS conversations (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
    content     TEXT    NOT NULL,
    intent      TEXT,
    timestamp   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
"""

CREATE_CHAT_SESSIONS = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chatsess_user ON chat_sessions(user_id);
"""

CREATE_USER_PREFERENCES = """
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id             TEXT PRIMARY KEY,
    response_style      TEXT DEFAULT 'balanced',    -- 'brief' | 'balanced' | 'detailed'
    prefers_charts      INTEGER DEFAULT 1,          -- 0 | 1
    top_interests       TEXT DEFAULT '[]',          -- JSON array of category names
    corrections         TEXT DEFAULT '[]',          -- JSON array of correction strings
    disliked_intents    TEXT DEFAULT '[]',          -- intents user has 👎'd
    updated_at          TEXT NOT NULL
);
"""

CREATE_FEEDBACK = """
CREATE TABLE IF NOT EXISTS feedback (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    message_id  TEXT    NOT NULL,
    rating      TEXT    NOT NULL CHECK(rating IN ('up', 'down')),
    correction  TEXT,
    intent      TEXT,
    timestamp   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
"""

@asynccontextmanager
async def _get_conn():
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn

async def init_db() -> None:
    """Create all tables if they don't exist. Called at app startup."""
    async with _get_conn() as conn:
        await conn.execute(CREATE_CONVERSATIONS)
        await conn.execute(CREATE_CHAT_SESSIONS)
        await conn.execute(CREATE_USER_PREFERENCES)
        await conn.execute(CREATE_FEEDBACK)
    logger.info("✅ PostgreSQL DB initialised via Settings DATABASE_URL")

async def save_message(
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    intent: str | None = None,
) -> None:
    """Persist a single message to the conversations table."""
    now = datetime.utcnow().isoformat()
    async with _get_conn() as conn:
        # Automatically create or update session timestamp
        title_snippet = content[:30] + ("..." if len(content) > 30 else "")
        if role == "user":
            await conn.execute(
                """INSERT INTO chat_sessions (session_id, user_id, title, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $4)
                   ON CONFLICT(session_id) DO UPDATE SET updated_at = $4""",
                session_id, user_id, title_snippet, now
            )
        else:
            await conn.execute(
                """UPDATE chat_sessions SET updated_at = $2 WHERE session_id = $1""",
                session_id, now
            )
            
        await conn.execute(
            """INSERT INTO conversations (user_id, session_id, role, content, intent, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            user_id, session_id, role, content, intent, now
        )

async def get_conversation_history(user_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch the most recent messages for a user across all sessions.
    Returns in chronological order (oldest first).
    """
    async with _get_conn() as conn:
        rows = await conn.fetch(
            """SELECT session_id, role, content, intent, timestamp
               FROM conversations
               WHERE user_id = $1
               ORDER BY id DESC
               LIMIT $2""",
            user_id, limit
        )
    return [dict(r) for r in reversed(rows)]

async def get_chat_sessions(user_id: str) -> list[dict]:
    """Fetch all chat sessions for a user, ordered by latest updated."""
    async with _get_conn() as conn:
        rows = await conn.fetch(
            """SELECT session_id, title, created_at, updated_at
               FROM chat_sessions
               WHERE user_id = $1
               ORDER BY updated_at DESC""",
            user_id
        )
    return [dict(r) for r in rows]

async def get_session_messages(user_id: str, session_id: str) -> list[dict]:
    """Fetch all messages for a specific session."""
    async with _get_conn() as conn:
        rows = await conn.fetch(
            """SELECT role, content, intent, timestamp, id
               FROM conversations
               WHERE user_id = $1 AND session_id = $2
               ORDER BY id ASC""",
            user_id, session_id
        )
    return [dict(r) for r in rows]

async def rename_session(user_id: str, session_id: str, title: str) -> bool:
    """Rename a session."""
    async with _get_conn() as conn:
        res = await conn.execute(
            "UPDATE chat_sessions SET title = $1, updated_at = $2 WHERE user_id = $3 AND session_id = $4",
            title, datetime.utcnow().isoformat(), user_id, session_id
        )
    return res.endswith("1")

async def delete_session(user_id: str, session_id: str) -> bool:
    """Delete a session and all its messages."""
    async with _get_conn() as conn:
        await conn.execute("DELETE FROM conversations WHERE user_id = $1 AND session_id = $2", user_id, session_id)
        res = await conn.execute("DELETE FROM chat_sessions WHERE user_id = $1 AND session_id = $2", user_id, session_id)
    return res.endswith("1")

async def get_last_session(user_id: str) -> dict | None:
    """
    Return the last session_id and its messages for a user.
    Useful for restoring context on re-login.
    """
    async with _get_conn() as conn:
        row = await conn.fetchrow(
            """SELECT session_id FROM conversations
               WHERE user_id = $1
               ORDER BY id DESC LIMIT 1""",
            user_id
        )
        if not row:
            return None
        session_id = row["session_id"]
        rows = await conn.fetch(
            """SELECT role, content, intent, timestamp
               FROM conversations
               WHERE user_id = $1 AND session_id = $2
               ORDER BY id ASC""",
            user_id, session_id
        )
    return {"session_id": session_id, "messages": [dict(r) for r in rows]}

async def get_user_preferences(user_id: str) -> dict:
    """Fetch preferences for a user. Returns defaults if not found."""
    defaults = {
        "user_id": user_id,
        "response_style": "balanced",
        "prefers_charts": True,
        "top_interests": [],
        "corrections": [],
        "disliked_intents": [],
    }
    async with _get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM user_preferences WHERE user_id = $1", user_id
        )
    if not row:
        return defaults
    prefs = dict(row)
    prefs["prefers_charts"] = bool(prefs["prefers_charts"])
    prefs["top_interests"] = json.loads(prefs.get("top_interests") or "[]")
    prefs["corrections"] = json.loads(prefs.get("corrections") or "[]")
    prefs["disliked_intents"] = json.loads(prefs.get("disliked_intents") or "[]")
    return prefs

async def upsert_user_preferences(user_id: str, updates: dict) -> None:
    """Create or update user preference fields."""
    existing = await get_user_preferences(user_id)
    merged = {**existing, **updates}
    async with _get_conn() as conn:
        await conn.execute(
            """INSERT INTO user_preferences
               (user_id, response_style, prefers_charts, top_interests, corrections, disliked_intents, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT(user_id) DO UPDATE SET
                   response_style = EXCLUDED.response_style,
                   prefers_charts = EXCLUDED.prefers_charts,
                   top_interests  = EXCLUDED.top_interests,
                   corrections    = EXCLUDED.corrections,
                   disliked_intents = EXCLUDED.disliked_intents,
                   updated_at     = EXCLUDED.updated_at""",
            user_id,
            merged.get("response_style", "balanced"),
            int(merged.get("prefers_charts", True)),
            json.dumps(merged.get("top_interests", [])),
            json.dumps(merged.get("corrections", [])[-10:]),  # keep last 10
            json.dumps(merged.get("disliked_intents", [])),
            datetime.utcnow().isoformat()
        )

async def save_feedback(
    user_id: str,
    session_id: str,
    message_id: str,
    rating: str,
    correction: str | None,
    intent: str | None,
) -> None:
    """Store a thumbs up/down feedback record."""
    async with _get_conn() as conn:
        await conn.execute(
            """INSERT INTO feedback (user_id, session_id, message_id, rating, correction, intent, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            user_id, session_id, message_id, rating, correction, intent, datetime.utcnow().isoformat()
        )

    if rating == "down" and correction:
        prefs = await get_user_preferences(user_id)
        corrections = prefs.get("corrections", [])
        corrections.append(correction)
        await upsert_user_preferences(user_id, {"corrections": corrections})
        logger.info("Saved correction for user %s: %s", user_id, correction[:80])

async def get_recent_corrections(user_id: str, limit: int = 3) -> list[str]:
    """Return the user's most recent correction texts (for prompt injection)."""
    prefs = await get_user_preferences(user_id)
    corrections = prefs.get("corrections", [])
    return corrections[-limit:]
