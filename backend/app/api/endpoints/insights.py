"""
insights.py
-----------
Serves narrative insight cards for Home, Expenses, and Assets screens.

Uses insight_engine_v2.py (pure-Python, zero ML deps) to generate
personalised, human-readable text cards from the user's transaction data.

ML spending-pattern data is fetched from the financeAI sidecar service
(port 8001). Falls back gracefully to STABLE pattern when unavailable.

Endpoints:
    GET /api/v1/insights/home      → hero card, streak nudge, savings nudge
    GET /api/v1/insights/expenses  → expense insight card, pattern caption, sub audit
    GET /api/v1/insights/assets    → net-worth insight, savings insight
    GET /api/v1/insights/all       → all of the above in one call (cached 30 min)
"""

import os
from datetime import datetime, date, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.sql import func, extract

from app.services.insight_engine_v2 import (
    DekhoInsightEngine, UserData,
    SpendingPattern, EmotionalTrigger, UserStage,
    TimeOfDay, MonthPosition,
)

from app.core.database import get_db
from app.models import User, Transaction
from app.api.endpoints.auth import get_current_user

router = APIRouter()
engine = DekhoInsightEngine()

# ── In-memory cache: {user_id: {"data": ..., "at": datetime}} ──
_cache: dict = {}
CACHE_TTL_MINUTES = 30

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")


# ---------------------------------------------------------------------------
# ML pattern fetch — graceful fallback
# ---------------------------------------------------------------------------
async def _fetch_ml_pattern(user_id: int) -> dict:
    """
    Calls the financeAI ML sidecar to get the user's spending pattern.
    Returns safe defaults if the service is unreachable (Phase C not done yet).
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{ML_SERVICE_URL}/api/users/ml/pattern/{user_id}")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass  # ML service not running yet — that's fine

    return {
        "primary_pattern": "stable",
        "secondary_pattern": None,
        "emotional_trigger": "none",
        "impulse_categories": [],
        "controlled_categories": [],
        "intentional_ratio": 0.6,
        "spends_more_on_weekends": False,
        "peak_spend_time": "evenings",
    }


# ---------------------------------------------------------------------------
# Build UserData from PostgreSQL using SQLAlchemy ORM
# ---------------------------------------------------------------------------
async def _build_user_data(user_id: int, db: Session) -> UserData:
    user: Optional[User] = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # ── Time / date context ──
    now = datetime.now()
    days_on_app = max((now.date() - user.created_at.date()).days, 1) if user.created_at else 1
    today_str = date.today().isoformat()
    current_hour = now.hour

    if 6 <= current_hour < 11:
        time_of_day = TimeOfDay.MORNING
    elif 11 <= current_hour < 17:
        time_of_day = TimeOfDay.AFTERNOON
    elif 17 <= current_hour < 21:
        time_of_day = TimeOfDay.EVENING
    else:
        time_of_day = TimeOfDay.NIGHT

    current_day = date.today().day
    if current_day <= 7:
        month_position = MonthPosition.START
    elif current_day >= 23:
        month_position = MonthPosition.END
    else:
        month_position = MonthPosition.MIDDLE

    is_salary_week = (1 <= current_day <= 5) or (25 <= current_day <= 31)

    # ── Days on app ──
    try:
        created_dt = user.created_at.replace(tzinfo=timezone.utc) if user.created_at else datetime.now(timezone.utc)
        days_on_app = max(0, (datetime.now(timezone.utc) - created_dt).days)
    except Exception:
        days_on_app = 30

    if days_on_app < 14:
        stage = UserStage.AWARE
    elif days_on_app < 60:
        stage = UserStage.UNDERSTANDING
    elif days_on_app < 180:
        stage = UserStage.HABIT
    else:
        stage = UserStage.CONFIDENT

    # ── Helper: base expense query for this user ──
    def expense_q():
        return db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.direction == "debit",
            Transaction.is_income == False,
            Transaction.is_transfer == False,
        )

    # ── Today ──
    today_rows = expense_q().filter(Transaction.date == today_str).all()
    today_spend = sum(r.amount for r in today_rows)
    today_top_category = ""
    today_largest_single = 0.0
    today_largest_vendor = ""
    today_transaction_count = len(today_rows)

    if today_rows:
        cat_totals: dict = {}
        for r in today_rows:
            cat_totals[r.category or "Others"] = cat_totals.get(r.category or "Others", 0) + r.amount
        today_top_category = max(cat_totals, key=cat_totals.__getitem__)
        biggest = max(today_rows, key=lambda r: r.amount)
        today_largest_single = biggest.amount
        today_largest_vendor = biggest.merchant or ""

    # ── 30-day average daily spend ──
    thirty_days_ago = (date.today().replace(day=1) if date.today().day <= 30
                       else date.today()).isoformat()
    avg_rows = expense_q().filter(Transaction.date >= thirty_days_ago).all()
    avg_daily_spend = sum(r.amount for r in avg_rows) / 30.0 if avg_rows else 0.0

    # ── This week ──
    week_rows = expense_q().filter(Transaction.date >= _days_ago(7)).all()
    week_spend = sum(r.amount for r in week_rows)
    week_cat_totals: dict = {}
    for r in week_rows:
        week_cat_totals[r.category or "Others"] = week_cat_totals.get(r.category or "Others", 0) + r.amount
    week_top_category = max(week_cat_totals, key=week_cat_totals.__getitem__) if week_cat_totals else ""
    week_categories = week_cat_totals

    last_week_rows = expense_q().filter(
        Transaction.date >= _days_ago(14),
        Transaction.date < _days_ago(7),
    ).all()
    last_week_spend = sum(r.amount for r in last_week_rows)
    week_vs_last_week_pct = (
        ((week_spend - last_week_spend) / last_week_spend) * 100
        if last_week_spend > 0 else 0.0
    )

    # ── This month ──
    month_start = date.today().replace(day=1).isoformat()
    month_rows = expense_q().filter(Transaction.date >= month_start).all()
    month_total = sum(r.amount for r in month_rows)

    month_cat_totals: dict = {}
    for r in month_rows:
        month_cat_totals[r.category or "Others"] = month_cat_totals.get(r.category or "Others", 0) + r.amount

    sorted_cats = sorted(month_cat_totals.items(), key=lambda x: -x[1])
    month_top_category = sorted_cats[0][0] if sorted_cats else ""
    month_top_amount = sorted_cats[0][1] if sorted_cats else 0.0
    month_second_category = sorted_cats[1][0] if len(sorted_cats) > 1 else ""
    month_second_amount = sorted_cats[1][1] if len(sorted_cats) > 1 else 0.0

    # ── Last month ──
    last_month_start, last_month_end = _last_month_range()
    last_month_rows = expense_q().filter(
        Transaction.date >= last_month_start,
        Transaction.date < last_month_end,
    ).all()
    last_month_total = sum(r.amount for r in last_month_rows)
    month_vs_last_month_pct = (
        ((month_total - last_month_total) / last_month_total) * 100
        if last_month_total > 0 else 0.0
    )
    last_month_cat_totals: dict = {}
    for r in last_month_rows:
        last_month_cat_totals[r.category or "Others"] = (
            last_month_cat_totals.get(r.category or "Others", 0) + r.amount
        )
    last_month_top_category = (
        max(last_month_cat_totals, key=last_month_cat_totals.__getitem__)
        if last_month_cat_totals else ""
    )

    # ── Income this month ──
    income_rows = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.direction == "credit",
        Transaction.date >= month_start,
    ).all()
    month_income = sum(r.amount for r in income_rows)

    # ── Budget — use user's actual monthly_budget, fall back to 50000 ──
    month_budget = float(user.monthly_budget or 0.0)
    remaining_budget = max(0.0, month_budget - month_total)

    # ── Streak (Calculate dynamically from transaction dates) ──
    tx_dates = db.query(Transaction.date).filter(
        Transaction.user_id == user_id
    ).distinct().order_by(Transaction.date.desc()).all()
    
    unique_dates = sorted(set([d[0] for d in tx_dates if d[0]]), reverse=True)
    
    current_streak = 0
    today_str = now.date().isoformat()
    yesterday_str = (now.date() - timedelta(days=1)).isoformat()
    
    if unique_dates and (unique_dates[0] == today_str or unique_dates[0] == yesterday_str):
        expected_date = date.fromisoformat(unique_dates[0])
        for d_str in unique_dates:
            if d_str == expected_date.isoformat():
                current_streak += 1
                expected_date = expected_date - timedelta(days=1)
            else:
                break
    
    # Save the computed streak to user (optional, but good for profile API)
    user.current_streak_days = current_streak
    
    streak_days = min(current_streak, days_on_app)

    # ── Subscriptions ──
    sub_rows = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_recurring == True,
        Transaction.date >= month_start,
    ).all()
    active_subscriptions = len(sub_rows)
    subscription_total = sum(r.amount for r in sub_rows)

    # ── ML pattern (async call) ──
    ml_data = await _fetch_ml_pattern(user_id)

    def _safe_pattern(value: str) -> SpendingPattern:
        try:
            return SpendingPattern(value.lower())
        except ValueError:
            return SpendingPattern.STABLE

    def _safe_emotion(value: str) -> EmotionalTrigger:
        try:
            return EmotionalTrigger(value.lower())
        except ValueError:
            return EmotionalTrigger.NONE

    primary_pattern = _safe_pattern(ml_data.get("primary_pattern", "stable"))
    emotional_trigger = _safe_emotion(ml_data.get("emotional_trigger", "none"))

    return UserData(
        name=user.name.split(" ")[0] if user.name else "there",
        days_on_app=days_on_app,
        stage=stage,
        time_of_day=time_of_day,
        month_position=month_position,
        is_salary_week=is_salary_week,
        streak_days=streak_days,

        # Today
        today_spend=today_spend,
        today_top_category=today_top_category,
        today_top_amount=today_largest_single,
        today_transaction_count=today_transaction_count,
        today_largest_single=today_largest_single,
        today_largest_vendor=today_largest_vendor,
        avg_daily_spend=avg_daily_spend,

        # Week
        week_spend=week_spend,
        week_vs_last_week_pct=week_vs_last_week_pct,
        week_intentional_ratio=ml_data.get("intentional_ratio", 0.6),
        week_top_category=week_top_category,
        week_categories=week_categories,

        # Month
        month_total=month_total,
        month_vs_last_month_pct=month_vs_last_month_pct,
        month_top_category=month_top_category,
        month_top_amount=month_top_amount,
        month_second_category=month_second_category,
        month_second_amount=month_second_amount,
        last_month_total=last_month_total,
        last_month_top_category=last_month_top_category,
        month_budget=month_budget,
        month_spent_so_far=month_total,
        remaining_budget=remaining_budget,
        saving_target_pct=0.20,
        investment_goal_pct=0.10,

        # ML patterns
        primary_pattern=primary_pattern,
        emotional_trigger=emotional_trigger,
        spends_more_on_weekends=ml_data.get("spends_more_on_weekends", False),
        peak_spend_time=ml_data.get("peak_spend_time", "evenings"),
        impulse_categories=ml_data.get("impulse_categories", []),
        controlled_categories=ml_data.get("controlled_categories", []),

        # Subscriptions
        active_subscriptions=active_subscriptions,
        subscription_total=subscription_total,
        unused_subscriptions=0,

        # Savings / investments (defaults — populated via Assets API later)
        savings_total=0.0,
        safety_months=0.0,
        investments_total=0.0,
        can_invest_more=False,
    )


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
async def _get_cached(user_id: int, db: Session) -> dict:
    cached = _cache.get(user_id)
    if cached:
        age_minutes = (datetime.now() - cached["at"]).seconds / 60
        if age_minutes < CACHE_TTL_MINUTES:
            return cached["data"]

    data = await _build_user_data(user_id, db)
    result = engine.generate_all(data)
    _cache[user_id] = {"data": result, "at": datetime.now()}
    return result


def _invalidate_cache(user_id: int):
    _cache.pop(user_id, None)


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------
def _days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _last_month_range() -> tuple[str, str]:
    today = date.today()
    if today.month == 1:
        start = date(today.year - 1, 12, 1)
        end = date(today.year, 1, 1)
    else:
        start = date(today.year, today.month - 1, 1)
        end = date(today.year, today.month, 1)
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/all")
async def get_all_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All insight cards in one cached response — used by Home, Expenses, Assets."""
    result = await _get_cached(current_user.id, db)
    return result


@router.get("/home")
async def get_home_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hero card, streak nudge, and savings nudge for the Home screen."""
    result = await _get_cached(current_user.id, db)
    return {
        "hero_card":    result.get("home", {}).get("hero_card"),
        "streak_nudge": result.get("home", {}).get("streak_nudge"),
        "savings_nudge": result.get("home", {}).get("savings_nudge"),
    }


@router.get("/expenses")
async def get_expenses_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Expense hero insight, pattern caption, and subscription audit."""
    result = await _get_cached(current_user.id, db)
    return result.get("expenses", {})


@router.get("/assets")
async def get_assets_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Net-worth insight and savings insight for the Assets screen."""
    result = await _get_cached(current_user.id, db)
    return result.get("assets", {})


@router.post("/invalidate")
async def invalidate_insights_cache(
    current_user: User = Depends(get_current_user),
):
    """Call this after uploading new transactions to bust the 30-min cache."""
    _invalidate_cache(current_user.id)
    return {"detail": "Insight cache cleared."}
