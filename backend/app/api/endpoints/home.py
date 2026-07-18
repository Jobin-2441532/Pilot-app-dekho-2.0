from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from datetime import datetime, date
from app.core.database import get_db
from app.models import Transaction, User
from app.api.endpoints.auth import get_current_user

router = APIRouter()

from pydantic import BaseModel
from app.services.insight_engine_v2 import UserData, SpendingPattern, EmotionalTrigger
from app.services.insight_engine_hero import get_hero_card_mode

@router.get("/reflection")
def get_home_reflection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Process streak check-in
    today = date.today()
    if current_user.last_checkin_date != today:
        if current_user.last_checkin_date:
            days_since = (today - current_user.last_checkin_date).days
            if days_since == 1:
                current_user.current_streak_days = (current_user.current_streak_days or 0) + 1
            elif days_since > 1:
                current_user.current_streak_days = 1
        else:
            current_user.current_streak_days = 1
        
        current_user.last_checkin_date = today
        db.commit()

    # Get user transactions for data populating
    all_txns = db.query(Transaction).filter(
        Transaction.user_id == current_user.id, 
        Transaction.direction == 'debit'
    ).all()
    
    today_str = today.isoformat()
    today_txns = [t for t in all_txns if t.date and t.date.startswith(today_str)]
    today_spend = sum(t.amount for t in today_txns)
    
    cat_totals = {}
    for t in today_txns:
        cat = t.category or "Others"
        cat_totals[cat] = cat_totals.get(cat, 0) + t.amount
    top_cat = max(cat_totals.items(), key=lambda x: x[1])[0] if cat_totals else "Others"
    top_cat_amount = cat_totals.get(top_cat, 0)

    # Current month spend
    current_month_prefix = today_str[:7] # YYYY-MM
    month_txns = [t for t in all_txns if t.date and t.date.startswith(current_month_prefix)]
    month_spend = sum(t.amount for t in month_txns)

    # Week spend vs last week (Sunday to Saturday)
    from datetime import timedelta
    days_since_sunday = (today.weekday() + 1) % 7
    start_of_this_week = today - timedelta(days=days_since_sunday)
    this_week_days = [(start_of_this_week + timedelta(days=i)).isoformat() for i in range(days_since_sunday + 1)]
    
    start_of_last_week = start_of_this_week - timedelta(days=7)
    last_week_days = [(start_of_last_week + timedelta(days=i)).isoformat() for i in range(7)]
    
    week_spend = sum(t.amount for t in all_txns if t.date and t.date[:10] in this_week_days)
    last_week_spend = sum(t.amount for t in all_txns if t.date and t.date[:10] in last_week_days)
    
    week_vs_last_week_pct = 0
    if last_week_spend > 0:
        week_vs_last_week_pct = int(((week_spend - last_week_spend) / last_week_spend) * 100)
    elif week_spend > 0:
        week_vs_last_week_pct = 100  # Default to 100% when there's spend but no previous week baseline

    total_spend = sum(t.amount for t in all_txns)
    unique_days = len(set(t.date[:10] for t in all_txns if t.date)) or 1
    avg_daily_spend = total_spend / unique_days

    created_date = current_user.created_at.date() if hasattr(current_user, "created_at") and current_user.created_at else today
    days_on_app = max((today - created_date).days, 1)

    from app.models import Budget
    monthly_budget_sum = db.query(func.sum(Budget.monthly_limit)).filter(Budget.user_id == current_user.id).scalar()
    monthly_budget = monthly_budget_sum if monthly_budget_sum else (current_user.monthly_budget or 0)
    remaining_budget = monthly_budget - month_spend

    # Populate UserData
    user_data = UserData(
        name=current_user.name.split(" ")[0] if current_user.name else "there",
        days_on_app=days_on_app,
        streak_days=min(current_user.current_streak_days or 0, days_on_app),
        today_spend=today_spend,
        today_top_category=top_cat,
        today_top_amount=top_cat_amount,
        avg_daily_spend=avg_daily_spend,
        week_spend=week_spend,
        week_vs_last_week_pct=week_vs_last_week_pct,
        remaining_budget=remaining_budget,
        month_budget=monthly_budget,
        primary_pattern=SpendingPattern.COMFORT_SPENDING,
    )
    
    response = get_hero_card_mode(user_data, current_user.last_hero_mode, current_user.last_mode_d_date)
    
    # Update last shown mode if not Mode D (Mode D doesn't repeat anyway)
    current_user.last_hero_mode = response["mode"]
    if response["mode"] == "Mode D":
        current_user.last_mode_d_date = today
    db.commit()

    return response

class ModeDResponse(BaseModel):
    answer: str

@router.post("/reflection/answer")
def post_reflection_answer(
    payload: ModeDResponse,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Store the response (in a real app, this goes to feedback_logs or ML pipeline)
    # For now, just return success
    return {"status": "success", "message": "Feedback noted."}
