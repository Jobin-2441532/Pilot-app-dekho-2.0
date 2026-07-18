"""
Chat Routes — the main API surface for the chatbot.

POST /api/chat          — full response (non-streaming)
POST /api/chat/stream   — SSE streaming response
GET  /api/chat/history  — conversation history
GET  /api/chat/context  — debug: show current user financial context
DELETE /api/chat/session — clear session
"""

from __future__ import annotations
import asyncio
import json
import logging
import time
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.models.schemas import ChatRequest, ChatResponse, ConversationMessage, ConversationHistory
from app.services.context_builder import build_context
from app.services.intent_detector import detect_intent
from app.services.prompt_engine import build_prompt
from app.services.llm_client import LLMClient
from app.services.memory_store import (
    store_message, get_history, get_llm_history,
    new_session_id, clear_session,
)
from app.services.response_builder import build_response_package
from app.services.session_summarizer import get_session_summaries, maybe_summarize_session
from app.services.rate_limiter import check_rate_limit
from app.services.response_cache import get_cached_response, set_cached_response
from app.services import db_store
from app.services.preference_manager import detect_signals, format_preferences_for_prompt
from app.auth import get_current_user
from app.config import settings

logger = logging.getLogger("dekho.routes.chat")
router = APIRouter()

# ── Auth helper ───────────────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)

def _resolve_user_id(
    jwt_user_id: str | None,
    body_user_id: str,
) -> str:
    """
    Return the authoritative user_id.
    - When auth_enabled=True  → use the JWT sub claim (validated, tamper-proof)
    - When auth_enabled=False → use user_id from request body (dev/test mode)

    In production (auth_enabled=True), the body user_id is IGNORED — the client
    cannot claim to be a different user by sending a different user_id in the body.
    """
    if settings.auth_enabled:
        if jwt_user_id is None:
            raise HTTPException(401, detail="Authentication required")
        return jwt_user_id
    return body_user_id  # dev mode — trust the request body

# ── Fallback responses (when LLM is unavailable) ──────────────────────────────

FALLBACK_RESPONSES: dict[str, str] = {
    "BALANCE_OVERVIEW":  "I'm having a moment of brain fog 🧠 — couldn't load your summary right now. Try again in a sec!",
    "SPENDING_QUERY":    "Having trouble fetching that spending data right now. Give me a moment and try again! 🙏",
    "BUDGET_STATUS":     "Budget check is on its way — I just need a moment. Please try again!",
    "GOAL_PROGRESS":     "Your goal data is loading slowly. Try again in a moment! 🎯",
    "ADVICE_REQUEST":    "I'd love to share some observations, but I'm having a slowdown. Try again shortly! 💡",
    "GENERAL_CHAT":      "Hey! I'm Dekho, your finance companion. I'm having a small hiccup — ask me again! 😊",
}

DEFAULT_FALLBACK = "I'm experiencing a brief slowdown ⏳ — please try again in a moment!"


# ── Core pipeline ─────────────────────────────────────────────────────────────

async def run_chat_pipeline(
    user_id: str,
    message: str,
    session_id: str,
    is_session_start: bool = False,
) -> dict:
    """
    Full chatbot pipeline:
    1. Rate limit check
    2. Build user financial context
    3. Detect intent + extract slots
    4. Check semantic response cache
    5. Assemble prompt + generate LLM response
    6. Build response package (chart + quick replies + alert)
    7. Store messages in memory
    """
    start_time = time.time()

    # 1. Rate limit
    allowed, remaining = await check_rate_limit(user_id)
    if not allowed:
        return {
            "text": "You're sending messages a bit fast! ⏳ I can handle 20 questions per minute — take a breath and try again shortly.",
            "chart": None, "quick_replies": [], "alert": None,
            "intent": "RATE_LIMITED", "is_fallback": True,
            "session_id": session_id, "latency_ms": 0,
        }

    # 2. Context
    ctx = await build_context(user_id)

    # 3. Intent
    intent_result = await detect_intent(message)
    logger.info(
        "user=%s session=%s intent=%s confidence=%.2f",
        user_id, session_id, intent_result.intent, intent_result.confidence,
    )

    # 4. Check semantic response cache
    cached = await get_cached_response(user_id, intent_result.intent, message)
    if cached:
        cached["session_id"] = session_id
        cached["latency_ms"] = int((time.time() - start_time) * 1000)
        return cached

    # 5. History + cross-session memory + preferences + Prompt
    history = await get_llm_history(session_id)
    past_summaries = await get_session_summaries(user_id)

    # Detect + persist any preference signals in this message
    signals = detect_signals(message)
    if signals:
        asyncio.create_task(db_store.upsert_user_preferences(user_id, signals))

    # Load preferences and build preference block for prompt
    prefs = await db_store.get_user_preferences(user_id)
    pref_block = format_preferences_for_prompt(prefs)

    system_prompt, user_instruction = build_prompt(ctx, intent_result, history, past_summaries, pref_block)

    # LLM generation (with fallback)
    is_fallback = False
    try:
        client = LLMClient()
        llm_text = await client.generate(
            system_prompt=system_prompt,
            user_message=f"User said: {message}\n\nInstruction: {user_instruction}",
            conversation_history=history,
        )
    except asyncio.TimeoutError:
        logger.warning("LLM timeout for user=%s", user_id)
        llm_text = FALLBACK_RESPONSES.get(intent_result.intent, DEFAULT_FALLBACK)
        is_fallback = True
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
            logger.warning("LLM quota exhausted for user=%s", user_id)
            llm_text = (
                "I'm a bit busy right now \u23f3 \u2014 my AI quota just ran out for this minute. "
                "Give me 30 seconds and try again! Your data is all here ready to go. \U0001f4aa"
            )
        else:
            logger.error("LLM error for user=%s: %s", user_id, e)
            llm_text = FALLBACK_RESPONSES.get(intent_result.intent, DEFAULT_FALLBACK)
        is_fallback = True

    # 6. Response package
    package = await build_response_package(ctx, intent_result, llm_text, is_session_start)
    package["is_fallback"] = is_fallback
    package["session_id"] = session_id
    package["latency_ms"] = int((time.time() - start_time) * 1000)

    # 7. Store messages (Redis + SQLite)
    await store_message(session_id, "user", message, user_id=user_id)
    await store_message(session_id, "assistant", llm_text, intent=intent_result.intent, user_id=user_id)

    # 8. Cache response + auto-summarize (non-blocking)
    await set_cached_response(user_id, intent_result.intent, package, message)
    asyncio.create_task(maybe_summarize_session(session_id, user_id))

    return package


# ── POST /api/chat — full response ────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None,
) -> ChatResponse:
    """Non-streaming chat endpoint — returns complete response JSON."""
    user_id = _resolve_user_id(jwt_user, req.user_id)
    session_id = req.session_id or new_session_id()

    try:
        package = await run_chat_pipeline(
            user_id=user_id,
            message=req.message,
            session_id=session_id,
        )
        return ChatResponse(**package)
    except Exception as e:
        logger.error("Chat endpoint error: %s", e, exc_info=True)
        raise HTTPException(500, detail="Internal error — please try again")


# ── POST /api/chat/stream — SSE streaming ─────────────────────────────────────

class StreamRequest(BaseModel):
    user_id: str
    message: str
    session_id: str | None = None
    is_session_start: bool = False


def _sse_event(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def stream_generator(
    user_id: str,
    message: str,
    session_id: str,
    is_session_start: bool,
) -> AsyncGenerator[str, None]:
    """SSE generator — emits: token | chart_data | quick_replies | done | error"""
    start_time = time.time()

    try:
        # Build context + detect intent (fast, non-LLM steps)
        ctx = await build_context(user_id)
        intent_result = await detect_intent(message)
        history = await get_llm_history(session_id)
        past_summaries = await get_session_summaries(user_id)

        # Detect + persist preference signals, then load and inject
        signals = detect_signals(message)
        if signals:
            asyncio.create_task(db_store.upsert_user_preferences(user_id, signals))
        prefs = await db_store.get_user_preferences(user_id)
        pref_block = format_preferences_for_prompt(prefs)

        system_prompt, user_instruction = build_prompt(ctx, intent_result, history, past_summaries, pref_block)

        # Emit intent detected
        yield _sse_event("intent", json.dumps({
            "intent": intent_result.intent,
            "confidence": intent_result.confidence,
        }))

        # Stream tokens
        client = LLMClient()
        full_text = ""
        is_llm_fallback = False
        try:
            async for token in client.stream(
                system_prompt=system_prompt,
                user_message=f"User said: {message}\n\nInstruction: {user_instruction}",
                conversation_history=history,
            ):
                full_text += token
                yield _sse_event("token", json.dumps({"text": token}))
        except asyncio.TimeoutError:
            fallback = FALLBACK_RESPONSES.get(intent_result.intent, DEFAULT_FALLBACK)
            full_text = fallback
            is_llm_fallback = True
            yield _sse_event("token", json.dumps({"text": fallback}))
            yield _sse_event("fallback", json.dumps({"reason": "timeout"}))
        except Exception as llm_err:
            # Catch 429 quota errors, network errors, model not found, etc.
            err_str = str(llm_err)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                reason = "quota_exceeded"
                fallback = (
                    "I'm a bit busy right now \u23f3 \u2014 my AI quota just ran out for this minute. "
                    "Give me 30 seconds and try again! Your data is all here ready to go. \U0001f4aa"
                )
            else:
                reason = "llm_error"
                fallback = FALLBACK_RESPONSES.get(intent_result.intent, DEFAULT_FALLBACK)
            full_text = fallback
            is_llm_fallback = True
            logger.warning("LLM stream fallback (%s): %s", reason, err_str[:120])
            yield _sse_event("token", json.dumps({"text": fallback}))
            yield _sse_event("fallback", json.dumps({"reason": reason}))

        # Build package (chart + quick replies + alerts)
        package = await build_response_package(ctx, intent_result, full_text, is_session_start)
        latency_ms = int((time.time() - start_time) * 1000)

        # Emit chart data if present
        if package["chart"]:
            yield _sse_event("chart_data", json.dumps(package["chart"].model_dump()))

        # Emit quick replies
        yield _sse_event("quick_replies", json.dumps({"items": package["quick_replies"]}))

        # Emit alert if present
        if package["alert"]:
            yield _sse_event("alert", json.dumps(package["alert"].model_dump()))

        # Done
        yield _sse_event("done", json.dumps({"latency_ms": latency_ms, "session_id": session_id}))

        # Store messages + trigger auto-summarization (non-blocking)
        await store_message(session_id, "user", message, user_id=user_id)
        await store_message(session_id, "assistant", full_text, intent=intent_result.intent, user_id=user_id)
        asyncio.create_task(maybe_summarize_session(session_id, user_id))

    except Exception as e:
        logger.error("Stream error: %s", e, exc_info=True)
        fallback = f"Sorry, I encountered an internal error: {str(e)}"
        yield _sse_event("token", json.dumps({"text": fallback}))
        yield _sse_event("error", json.dumps({"message": "Something went wrong. Please try again."}))


@router.post("/stream")
async def chat_stream(
    req: StreamRequest,
    jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None,
) -> StreamingResponse:
    """SSE streaming chat endpoint — emits tokens as they are generated."""
    user_id = _resolve_user_id(jwt_user, req.user_id)
    session_id = req.session_id or new_session_id()
    return StreamingResponse(
        stream_generator(user_id, req.message, session_id, req.is_session_start),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
        },
    )


# ── GET /api/chat/history ─────────────────────────────────────────────────────

@router.get("/history/{user_id}")
async def chat_history(
    user_id: str,
    session_id: str = Query(..., description="Session ID to fetch history for"),
) -> ConversationHistory:
    """Return conversation history for a session."""
    messages_raw = await get_history(session_id)
    messages = [
        ConversationMessage(
            role=m["role"],
            content=m["content"],
            intent=m.get("intent"),
            timestamp=m["timestamp"],
        )
        for m in messages_raw
    ]
    return ConversationHistory(user_id=user_id, session_id=session_id, messages=messages)


# ── GET /api/chat/context/{user_id} — debug ───────────────────────────────────

@router.get("/context/{user_id}")
async def get_context(user_id: str):
    """Debug endpoint — shows the full financial context for a user."""
    ctx = await build_context(user_id)
    return ctx.model_dump()


# ── DELETE /api/chat/session — clear ───────────────────────────────────────────

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clear a chat session (new chat button)."""
    await clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}


# ── GET /api/chat/db-history/{user_id} — persistent history from SQLite ─────────

@router.get("/db-history/{user_id}")
async def db_history(user_id: str, limit: int = Query(50, ge=1, le=200)):
    """Return full persistent conversation history for a user from SQLite DB."""
    messages = await db_store.get_conversation_history(user_id, limit=limit)
    return {"user_id": user_id, "messages": messages, "count": len(messages)}


# ── GET /api/chat/last-session/{user_id} — restore last session ─────────────────

@router.get("/last-session/{user_id}")
async def last_session(user_id: str):
    """
    Return the last session's messages for a user from SQLite DB.
    Useful for restoring context on re-login if localStorage is empty.
    """
    data = await db_store.get_last_session(user_id)
    if not data:
        return {"user_id": user_id, "session_id": None, "messages": []}
    return {"user_id": user_id, **data}


# ── POST /api/feedback — thumbs up/down ───────────────────────────────────────

class FeedbackRequest(BaseModel):
    user_id: str
    session_id: str
    message_id: str
    rating: str   # "up" | "down"
    correction: str | None = None
    intent: str | None = None


@router.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    """Store user feedback (thumbs up/down) and optional correction text."""
    if req.rating not in ("up", "down"):
        raise HTTPException(400, detail="rating must be 'up' or 'down'")
    await db_store.save_feedback(
        user_id=req.user_id,
        session_id=req.session_id,
        message_id=req.message_id,
        rating=req.rating,
        correction=req.correction,
        intent=req.intent,
    )
    asyncio.create_task(_update_prefs_from_feedback(req.user_id, req.rating, req.intent))
    return {"status": "ok", "message_id": req.message_id}


async def _update_prefs_from_feedback(user_id: str, rating: str, intent: str | None) -> None:
    """Non-blocking: track disliked intents on repeated thumbs-down."""
    if rating == "down" and intent:
        prefs = await db_store.get_user_preferences(user_id)
        disliked = prefs.get("disliked_intents", [])
        if disliked.count(intent) < 3:
            disliked.append(intent)
        await db_store.upsert_user_preferences(user_id, {"disliked_intents": disliked})


# ── GET /api/chat/preferences/{user_id} ───────────────────────────────────────

@router.get("/preferences/{user_id}")
async def get_preferences(user_id: str):
    """Return current learned preferences for a user."""
    return await db_store.get_user_preferences(user_id)


# ── Session Management Endpoints ───────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None) -> list[dict]:
    """Get all chat sessions for the user."""
    user_id = _resolve_user_id(jwt_user, "user_1")
    return await db_store.get_chat_sessions(user_id)

@router.get("/sessions/{session_id}")
async def get_session(session_id: str, jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None) -> list[dict]:
    """Get all messages for a specific session."""
    user_id = _resolve_user_id(jwt_user, "user_1")
    return await db_store.get_session_messages(user_id, session_id)

class RenameSessionRequest(BaseModel):
    title: str

@router.put("/sessions/{session_id}")
async def rename_session(session_id: str, req: RenameSessionRequest, jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None):
    """Rename a session."""
    user_id = _resolve_user_id(jwt_user, "user_1")
    success = await db_store.rename_session(user_id, session_id, req.title)
    if not success:
        raise HTTPException(404, "Session not found")
    return {"success": True}

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, jwt_user: str | None = Depends(get_current_user) if settings.auth_enabled else None):
    """Delete a session."""
    user_id = _resolve_user_id(jwt_user, "user_1")
    success = await db_store.delete_session(user_id, session_id)
    if not success:
        raise HTTPException(404, "Session not found")
    from app.services.memory_store import clear_session
    await clear_session(session_id)
    return {"success": True}
