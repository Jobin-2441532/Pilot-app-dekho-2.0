"""
chat.py
-------
Dekho AI Chatbot endpoint — powered by Gemini + FAISS RAG.

Phase E changes:
  1. JWT isolation — all DB queries scoped to current_user.id (was already done)
  2. Fixed process_action_tags — reuses the request Session instead of leaking a new SessionLocal()
  3. ML pattern injection — calls the financeAI sidecar to get the user's spending archetype
     and injects it into the system prompt so Gemini gives personalised advice
  4. Simple /chat/message endpoint — accepts { message } body from the Home page mini-chat,
     wraps it into the full messages format transparently
"""

import re
import logging
import os
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from uuid import uuid4
from datetime import datetime, timezone
import traceback

import httpx
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.api.schemas import ChatRequest, ChatResponse, ChatMessage, SourceItem, ChatActionRequest, ChatActionResponse
# Removed unused retriever import
from app.services.gemini_service import generate_chat_response
from app.core.database import get_db
from app.models import User, Transaction, SavingsGoal, ChatSession
from app.services.chat_context import build_chat_context
from app.api.endpoints.auth import get_current_user

logger = logging.getLogger("dekho.chat")
router = APIRouter()

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_TEMPLATE = """You are Ask Dekho, a personal finance companion inside the Dekho app.
You help users understand their money in a calm, practical, and honest way.
You are not a generic chatbot. You are not an assistant trying to impress. You are a thoughtful financial friend.

The user's live financial data is below. Use it when relevant. Do not invent numbers.

User Financial Context (LIVE — this is the source of truth):
{global_context}

Financial Knowledge (general articles, not user-specific):
{knowledge_context}

{ml_pattern_section}

DATA ACCURACY RULES (CRITICAL):
- The "User Financial Context" above is pulled live from the database. It is the ONLY source of truth for this user's numbers, goals, spending, and balances.
- Do NOT use any numbers, goals, or transactions from outside that section.
- If the context says the user has 2 goals, there are exactly 2 goals. Do not mention any other goals.
- If the context says May spending is Rs22,590, use that number. Do not guess or use cached data.
- The Financial Knowledge section contains general articles — do not use those to invent user-specific data.

STYLE RULES:
Use natural language.
Avoid excessive bullets.
Avoid heavy formatting.
Do not overuse emojis.
Do not use stars, hashes, or percentage symbols as decorative style.
Do not sound excited unless the user is excited.
Do not sound overly polished or corporate.
Write like a calm financial friend who is trying to help, not impress.
If the answer is simple, keep it simple.
If the answer is uncertain, say so directly.

BEHAVIOR RULES:
If the user's request is ambiguous, ask one clarifying question before acting.
If the financial data is incomplete, say what is missing.
If the data is sparse, avoid confident conclusions.
If a request involves editing, deleting, or changing a goal and the action is not fully supported, do not pretend it was done.
If the app can complete a task, state it clearly.
If the app cannot complete a task, explain the closest supported alternative.
When giving guidance, use this order: understand first, explain second, guide third.

WHAT THE APP CAN AND CANNOT DO:
You can create a new savings goal, or add money to an existing goal.
You cannot edit a goal's name or target amount via chat.
You cannot delete goals or transactions via chat.
You cannot set up autopay, manage assets, or access bank accounts.
If the user asks for something unsupported, say so clearly and suggest the nearest available alternative in the app.

EMOTIONAL SAFETY:
Never shame or judge the user for their spending habits. Never lecture. If habits are a concern, note it once, gently, and move on.

INVESTMENT ADVICE BOUNDARY:
You are not a SEBI registered investment advisor. Do not recommend specific stocks, mutual funds, or crypto. You may explain what things are (e.g. what is an SIP) but always clarify it is educational, not a personal recommendation.

DATABASE ACTIONS (hidden — do not show to user):
When the user clearly asks to create a savings goal, append this on a new line at the very end of your response:
[ACTION: ADD_GOAL | <Goal Name> | <Target Amount as plain number e.g. 25000>]

When the user clearly asks to add money to an existing goal, append this on a new line at the very end:
[ACTION: ADD_TO_GOAL | <Goal Name> | <Amount as plain number>]

Only use these tags when the intent is unambiguous. If there is any doubt, ask one clarifying question first.

VISUAL ELEMENTS — USE THESE PROACTIVELY for financial questions:

Whenever the user asks about spending categories, breakdowns, or "where does my money go" — always include:
[UI: CHART | Pie | <Title> | <Category1>:<Amount1>, <Category2>:<Amount2>, ...]

Whenever the user asks about spending over time, comparisons, or month-vs-month — always include:
[UI: CHART | Bar | <Title> | <Label1>:<Amount1>, <Label2>:<Amount2>]

Whenever the user asks about a savings goal or mentions a goal by name — always include:
[UI: PROGRESS | <Goal Name> | <Current Amount> | <Target Amount>]

Whenever the user asks for a single key number (e.g. "how much did I spend", "what's my savings rate") — include:
[UI: METRIC | <Label> | <Value>]

When answering about all goals at once — include one [UI: PROGRESS ...] block per goal.

RULES FOR VISUAL ELEMENTS:
- Use ONLY numbers in the data fields (no ₹ symbol, no commas). Example: [UI: CHART | Pie | May Spending | Housing:18000, Groceries:2100]
- Amounts must be plain integers or decimals only.
- Always place visual tags on their own line, after the text explanation.
- Do not use visual tags inside sentences.

Use Indian formatting in text: rupees as ₹, amounts in thousands or lakhs where natural.
"""

ML_PATTERN_SECTION_TEMPLATE = """ML Spending Pattern Analysis (Use to personalise advice):
  Spending Archetype : {primary_pattern}
  Emotional Trigger  : {emotional_trigger}
  Peak Spend Time    : {peak_spend_time}
  Weekend Spender    : {spends_more_on_weekends}
  Impulse Categories : {impulse_categories}
  Controlled Cats    : {controlled_categories}
  Intentional Ratio  : {intentional_ratio:.0%}
"""


# ---------------------------------------------------------------------------
# ML pattern fetch — non-blocking, graceful fallback
# ---------------------------------------------------------------------------
async def _fetch_ml_pattern(user_id: int) -> Optional[dict]:
    """
    Fetch ML spending pattern from the financeAI sidecar.
    Returns None if sidecar is unavailable — prompt gracefully degrades.
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{ML_SERVICE_URL}/api/users/ml/pattern/{user_id}")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return None


def _build_ml_section(pattern: Optional[dict]) -> str:
    """Format the ML pattern into the prompt section, or empty string if unavailable."""
    if not pattern:
        return ""
    try:
        return ML_PATTERN_SECTION_TEMPLATE.format(
            primary_pattern=pattern.get("primary_pattern", "unknown").replace("_", " ").title(),
            emotional_trigger=pattern.get("emotional_trigger", "none").replace("_", " ").title(),
            peak_spend_time=pattern.get("peak_spend_time", "unknown"),
            spends_more_on_weekends="Yes" if pattern.get("spends_more_on_weekends") else "No",
            impulse_categories=", ".join(pattern.get("impulse_categories", [])) or "None",
            controlled_categories=", ".join(pattern.get("controlled_categories", [])) or "None",
            intentional_ratio=float(pattern.get("intentional_ratio", 0.5)),
        )
    except Exception as e:
        logger.warning(f"ML pattern formatting failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Action tag processor — uses the injected DB session (no leak)
# ---------------------------------------------------------------------------
def process_action_tags(response_text: str, user_id: int, db: Session) -> str:
    """
    Detects [ACTION: ADD_GOAL | Title | Amount] or [ACTION: ADD_TO_GOAL | Title | Amount] tags,
    creates/updates the DB records (including dekho_wallet_balance),
    and strips the tag so the frontend never sees internal instructions.
    """
    import re as _re

    def parse_financial_number(text_val: str) -> float:
        if not text_val: return 0.0
        text_val = text_val.lower().replace(',', '').strip()
        
        multiplier = 1.0
        if 'm' in text_val or 'million' in text_val:
            multiplier = 1000000.0
        elif 'lakh' in text_val or 'l' in text_val:
            multiplier = 100000.0
        elif 'k' in text_val:
            multiplier = 1000.0
        
        numeric_str = _re.sub(r'[^\d.]', '', text_val)
        if numeric_str:
            try:
                return float(numeric_str) * multiplier
            except:
                pass
        return 0.0

    action_taken = False

    # DEBUG: Print first 500 chars of AI response to see if tags are present
    logger.info(f"[DEBUG] AI RESPONSE (first 500 chars): {response_text[:500]}")
    logger.info(f"[DEBUG] ACTION tag present: {'[ACTION:' in response_text.upper()}")
    logger.info(f"[DEBUG] UI PROGRESS tag present: {'[UI: PROGRESS' in response_text.upper() or '[UI:PROGRESS' in response_text.upper()}")

    # 1. Check for ADD_GOAL
    add_goal_match = re.search(
        r'\[ACTION:\s*ADD_GOAL\s*\|\s*([^|\]]+)\s*\|\s*([^\]]+)\]',
        response_text,
        re.IGNORECASE,
    )
    if add_goal_match:
        action_taken = True
        title = add_goal_match.group(1).strip()
        try:
            amount = parse_financial_number(add_goal_match.group(2))
            # Rollback any aborted PostgreSQL transaction from earlier in this session
            db.rollback()
            new_goal = SavingsGoal(
                user_id=user_id,
                name=title,
                target_amount=amount,
                current_amount=0,
                status='active',
            )
            db.add(new_goal)
            db.commit()
            logger.info(f"[OK] Goal created via chat: '{title}' Rs{amount:,.0f} for user {user_id}")
        except Exception as e:
            db.rollback()
            logger.error(f"[ERR] Goal creation failed: {e}")

    # 2. Check for ADD_TO_GOAL
    add_to_goal_match = re.search(
        r'\[ACTION:\s*ADD_TO_GOAL\s*\|\s*([^|\]]+)\s*\|\s*([^\]]+)\]',
        response_text,
        re.IGNORECASE,
    )
    if add_to_goal_match:
        action_taken = True
        title = add_to_goal_match.group(1).strip()
        try:
            amount = parse_financial_number(add_to_goal_match.group(2))
            # Rollback any aborted PostgreSQL transaction from earlier in this session
            db.rollback()
            goal = db.query(SavingsGoal).filter(
                SavingsGoal.user_id == user_id,
                SavingsGoal.name.ilike(f"%{title}%")
            ).first()
            
            if goal:
                goal.current_amount += amount
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    user.dekho_wallet_balance += amount
                db.commit()
                logger.info(f"[OK] Added Rs{amount:,.0f} to goal '{title}' and increased wallet balance for user {user_id}")
            else:
                logger.warning(f"[WARN] Goal '{title}' not found to add money")
        except Exception as e:
            db.rollback()
            logger.error(f"[ERR] Add to goal failed: {e}")

    # 3. Fallback: Auto-create goal if [UI: PROGRESS | Title | Current | Target] is found
    ui_progress_match = re.search(
        r'\[UI:\s*PROGRESS\s*\|\s*([^|\]]+)\s*\|\s*([^|\]]+)\s*\|\s*([^\]]+)\]',
        response_text,
        re.IGNORECASE,
    )
    if ui_progress_match:
        title = ui_progress_match.group(1).strip()
        try:
            target = parse_financial_number(ui_progress_match.group(3))
            # Rollback any aborted PostgreSQL transaction from earlier in this session
            db.rollback()
            existing_goal = db.query(SavingsGoal).filter(
                SavingsGoal.user_id == user_id,
                SavingsGoal.name.ilike(f"%{title}%")
            ).first()

            if not existing_goal:
                action_taken = True
                new_goal = SavingsGoal(
                    user_id=user_id,
                    name=title,
                    target_amount=target,
                    current_amount=0,
                    status='active',
                )
                db.add(new_goal)
                db.commit()
                logger.info(f"[OK] Auto-created missing goal from UI tag: '{title}' Rs{target:,.0f}")
        except Exception as e:
            db.rollback()
            logger.error(f"[ERR] Auto-goal creation failed: {e}")

    # Strip ALL action tags from the final response
    cleaned_text = re.sub(r'\[ACTION:[^\]]+\]', '', response_text).strip()
    return cleaned_text, action_taken


# ---------------------------------------------------------------------------
# Last-resort NLP fallback — detects goal creation from user message directly
# ---------------------------------------------------------------------------
def _nlp_goal_fallback(user_message: str, ai_response: str, user_id: int, db: Session) -> bool:
    """
    If the AI forgot to output an [ACTION: ADD_GOAL] tag, this function tries to
    detect goal-creation intent from the user's own message and saves it to the DB.
    Returns True if a goal was created.
    """
    import re as _re

    msg_lower = user_message.lower()

    # Check if user's message has goal-creation intent keywords
    goal_keywords = ['save', 'saving', 'goal', 'target', 'fund', 'buy', 'purchase', 'want to get', 'saving for']
    create_keywords = ['create', 'set', 'add', 'make', 'start', 'new', 'help me', 'i want to', 'i need to', 'plan']

    has_goal_intent = any(kw in msg_lower for kw in goal_keywords)
    has_create_intent = any(kw in msg_lower for kw in create_keywords)

    logger.info(f"[NLP] fallback: user_msg='{user_message[:100]}' goal_intent={has_goal_intent} create_intent={has_create_intent}")

    if not (has_goal_intent and has_create_intent):
        return False

    # Try to extract an amount from the user's message
    # Strategy: find ALL numbers and pick the LARGEST one with a > 500 threshold
    # (This avoids picking "6 months" instead of "25000")
    amount = 0.0
    
    # First try explicit multiplier patterns
    lakh_m = _re.search(r'(\d+(?:\.\d+)?)\s*(?:lakh|lakhs)\b', msg_lower)
    k_m = _re.search(r'(\d+(?:\.\d+)?)\s*k\b', msg_lower)
    
    if lakh_m:
        amount = float(lakh_m.group(1)) * 100000
    elif k_m:
        amount = float(k_m.group(1)) * 1000
    else:
        # Find all plain numbers and pick the largest one that's > 500
        all_numbers = _re.findall(r'\b(\d[\d,]*(?:\.\d+)?)\b', msg_lower)
        candidates = []
        for n in all_numbers:
            try:
                val = float(n.replace(',', ''))
                if val > 500:
                    candidates.append(val)
            except:
                pass
        if candidates:
            amount = max(candidates)

    logger.info(f"[NLP] fallback: extracted amount={amount}")

    if amount <= 0:
        logger.info("NLP fallback: goal intent detected but no valid amount found")
        return False

    # Try to extract a goal name from the user's message
    # Look for noun phrases after "for a/an/the", "to buy", "to get", "for my"
    name_patterns = [
        r'(?:for (?:a|an|the|my)\s+)([a-z][a-z\s]{2,30}?)(?:\s+(?:for|in|over|within|by|target|goal)|\s*$)',
        r'(?:to (?:buy|get|purchase)\s+(?:a|an|the|my)?\s*)([a-z][a-z\s]{2,30}?)(?:\s+(?:for|in|over|within|by)|\s*$)',
        r'(?:saving for\s+(?:a|an|the|my)?\s*)([a-z][a-z\s]{2,30}?)(?:\s+(?:for|in|over|within|by)|\s*$)',
        r'(?:goal\s+(?:for|of)\s+(?:a|an|the|my)?\s*)([a-z][a-z\s]{2,30}?)(?:\s+(?:for|in|over|within|by)|\s*$)',
        r'(?:a\s+(?:new\s+)?)([a-z][a-z\s]{2,25}?)(?:\s+(?:goal|fund|target|purchase|savings?)|\s*$)',
    ]

    goal_name = None
    for pattern in name_patterns:
        m = _re.search(pattern, msg_lower)
        if m:
            candidate = m.group(1).strip().rstrip('.,!?')
            # Filter out generic words
            if candidate not in ('goal', 'saving', 'savings', 'money', 'fund', 'target', 'amount', 'months', 'years'):
                goal_name = candidate.title()
                break

    if not goal_name:
        # As last resort, look for capitalized nouns in the user message
        words = user_message.split()
        for word in words:
            if word[0].isupper() and len(word) > 3 and word.lower() not in ('create', 'goal', 'help', 'save', 'saving', 'month', 'year', 'the', 'for', 'next', 'that'):
                goal_name = word.title()
                break

    if not goal_name:
        goal_name = "Savings Goal"

    # Check if this goal already exists for this user
    existing = db.query(SavingsGoal).filter(
        SavingsGoal.user_id == user_id,
        SavingsGoal.name.ilike(f"%{goal_name}%")
    ).first()

    if existing:
        logger.info(f"NLP fallback: goal '{goal_name}' already exists, skipping creation")
        return False

    try:
        # Rollback any aborted PostgreSQL transaction from earlier in this session
        db.rollback()
        new_goal = SavingsGoal(
            user_id=user_id,
            name=goal_name,
            target_amount=amount,
            current_amount=0,
            status='active',
        )
        db.add(new_goal)
        db.commit()
        logger.info(f"[OK] NLP fallback created goal: '{goal_name}' target=Rs {amount:,.0f} for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"NLP fallback goal creation failed: {e}")
        db.rollback()
        return False


# ---------------------------------------------------------------------------
# Helper: build the full prompt context
# ---------------------------------------------------------------------------
def _get_global_context(db: Session, user_id: int) -> str:
    try:
        return build_chat_context(db, user_id)
    except Exception as e:
        logger.warning(f"build_chat_context failed: {e}")
        return "Error loading financial context."


# ---------------------------------------------------------------------------
# POST /chat  — full messages array (used by /ask page)
# ---------------------------------------------------------------------------
@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full chat endpoint — accepts a messages array with full conversation history.
    Used by the /ask (dedicated chat) page.
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array cannot be empty")

    latest_user_message = request.messages[-1].content
    chat_history = request.messages[:-1]

    return await _process_chat(
        user_message=latest_user_message,
        chat_history=chat_history,
        db=db,
        current_user=current_user,
    )


# ---------------------------------------------------------------------------
# POST /chat/message  — simple { message } body (used by Home mini-chat)
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class SimpleMessageRequest(BaseModel):
    message: str

@router.post("/chat/message")
async def simple_chat_endpoint(
    request: SimpleMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simplified single-message endpoint for the Home page mini-chat.
    Returns { reply: "..." } instead of the full ChatResponse schema.
    """
    response = await _process_chat(
        user_message=request.message,
        chat_history=[],
        db=db,
        current_user=current_user,
    )
    return {"reply": response.message.content}


# ---------------------------------------------------------------------------
# GET /chat/history  — Phase 6: Session Memory
# Returns the user's last N chat messages (chronological order)
# ---------------------------------------------------------------------------
@router.get("/chat/history")
def get_chat_history(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns up to `limit` most recent chat messages for the current user,
    ordered chronologically (oldest first) so the frontend can replay them.
    """
    rows = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.id.asc())   # id is auto-increment — guarantees insertion order
        .limit(limit)
        .all()
    )
    return [
        {
            "role": r.role,
            "content": r.content,
            "id": str(r.id),
            "timestamp": r.created_at.isoformat() + "Z" if r.created_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# DELETE /chat/history  — clear session memory for the current user
# ---------------------------------------------------------------------------
@router.delete("/chat/history")
def clear_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clears all stored chat history for the current user."""
    try:
        db.rollback()
        deleted = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).delete()
        db.commit()
        logger.info(f"[DB] Cleared {deleted} history messages for user {current_user.id}")
        return {"deleted": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear history: {str(e)}")


# ---------------------------------------------------------------------------
# POST /chat/action  — dedicated deterministic action endpoint (Phase 3)
# Bypasses AI-generated tags entirely. Frontend calls this directly.
# ---------------------------------------------------------------------------
@router.post("/chat/action", response_model=ChatActionResponse)
async def chat_action_endpoint(
    request: ChatActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dedicated endpoint for goal creation and goal money additions.
    Called directly by the frontend after parsing user intent —
    does NOT depend on the AI producing correct tags.
    """
    try:
        db.rollback()  # Clear any stale PostgreSQL transaction state

        if request.action_type == 'ADD_GOAL':
            # Prevent duplicates: check if goal with same name already exists
            existing = db.query(SavingsGoal).filter(
                SavingsGoal.user_id == current_user.id,
                SavingsGoal.name.ilike(f"%{request.goal_name}%")
            ).first()

            if existing:
                logger.info(f"[OK] Action endpoint: goal '{request.goal_name}' already exists for user {current_user.id}")
                return ChatActionResponse(
                    success=True,
                    message=f"Goal '{existing.name}' already exists.",
                    goal_id=existing.id,
                )

            new_goal = SavingsGoal(
                user_id=current_user.id,
                name=request.goal_name,
                target_amount=request.amount,
                current_amount=0,
                status='active',
            )
            db.add(new_goal)
            db.commit()
            db.refresh(new_goal)
            logger.info(f"[OK] Action endpoint: created goal '{request.goal_name}' Rs{request.amount:,.0f} for user {current_user.id}")
            return ChatActionResponse(
                success=True,
                message=f"Goal '{request.goal_name}' created with a target of ₹{request.amount:,.0f}.",
                goal_id=new_goal.id,
            )

        elif request.action_type == 'ADD_TO_GOAL':
            goal = db.query(SavingsGoal).filter(
                SavingsGoal.user_id == current_user.id,
                SavingsGoal.name.ilike(f"%{request.goal_name}%")
            ).first()

            if not goal:
                return ChatActionResponse(
                    success=False,
                    message=f"No goal matching '{request.goal_name}' found.",
                )

            goal.current_amount = (goal.current_amount or 0) + request.amount
            user = db.query(User).filter(User.id == current_user.id).first()
            if user:
                user.dekho_wallet_balance = (user.dekho_wallet_balance or 0) + request.amount
            db.commit()
            logger.info(f"[OK] Action endpoint: added Rs{request.amount:,.0f} to '{goal.name}' for user {current_user.id}")
            return ChatActionResponse(
                success=True,
                message=f"₹{request.amount:,.0f} added to '{goal.name}'.",
                goal_id=goal.id,
            )

    except Exception as e:
        db.rollback()
        logger.error(f"[ERR] Action endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Action failed: {str(e)}")


# ---------------------------------------------------------------------------
# Core logic — shared by both endpoints
# ---------------------------------------------------------------------------
async def _process_chat(
    user_message: str,
    chat_history: list,
    db: Session,
    current_user: User,
) -> ChatResponse:
    try:
        # 1. FAISS RAG retrieval
        if not retriever.is_ready:
            retriever.load()

        retrieved_chunks = retriever.search_hybrid(
            user_message,
            data_k=0,          # Disable stale FAISS data chunks — live DB context is injected instead
            knowledge_k=3,
        )

        # Only use knowledge articles from FAISS (general finance tips)
        # Data/transaction chunks are intentionally excluded to prevent hallucination
        knowledge_chunks = [c for c in retrieved_chunks if c.get('chunk_type') == 'knowledge']
        knowledge_text = "\n---\n".join([c.get('text', '') for c in knowledge_chunks])

        # 2. Global financial context (JWT-scoped via current_user.id)
        global_text = _get_global_context(db, current_user.id)

        # 3. ML pattern injection (non-blocking — graceful if sidecar is offline)
        ml_pattern = await _fetch_ml_pattern(current_user.id)
        ml_section = _build_ml_section(ml_pattern)

        # 4. Build system prompt with ML context injected
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            global_context=global_text,
            knowledge_context=knowledge_text if knowledge_text else "No specific knowledge found.",
            ml_pattern_section=ml_section,
        )

        # 5. Generate response via Gemini
        ai_response_text = generate_chat_response(system_prompt, chat_history, user_message)

        # 6. Process action tags — uses injected db session (Phase E fix: no connection leak)
        processed_response_text, action_taken = process_action_tags(ai_response_text, current_user.id, db)

        # 6b. LAST-RESORT FALLBACK: If the AI didn't produce an ACTION tag but the user
        #     clearly asked to create a goal, parse it directly from the user message.
        if not action_taken:
            action_taken = _nlp_goal_fallback(user_message, ai_response_text, current_user.id, db)

        # 7. Build source citations (knowledge articles only)
        sources = []
        for c in knowledge_chunks:
            label = f"Article: {c.get('source', '').replace('.md', '').replace('_', ' ').title()}"
            sources.append(SourceItem(
                label=label,
                text=c.get('text', '')[:150] + "...",
                type="knowledge",
            ))

        # 8. Persist the exchange to DB for session memory (Phase 6)
        # Commit user message first, then assistant — ensures distinct IDs for correct sort order
        try:
            db.rollback()  # Clear any stale state before writing
            db.add(ChatSession(
                user_id=current_user.id,
                role='user',
                content=user_message,
            ))
            db.commit()   # First commit — gives user message a lower id
            db.add(ChatSession(
                user_id=current_user.id,
                role='assistant',
                content=processed_response_text,
            ))
            db.commit()   # Second commit — assistant id is always > user id
            logger.info(f"[DB] Session: persisted 2 messages for user {current_user.id}")
        except Exception as persist_err:
            db.rollback()
            logger.warning(f"[WARN] Session persist failed (non-fatal): {persist_err}")

        return ChatResponse(
            message=ChatMessage(
                role="assistant",
                content=processed_response_text,
                id=str(uuid4()),
                timestamp=datetime.now(timezone.utc).isoformat(),
                sources=sources,
            ),
            action_taken=action_taken
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")
