from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app.core.database import get_db
from app.models import Transaction, SavingsGoal, User, Asset, Recommendation
from app.api.endpoints.auth import get_current_user

router = APIRouter()

# ---------------------------------------------------------------------------
# Transactions — with pagination + date range filtering
# ---------------------------------------------------------------------------
@router.get("/transactions")
def get_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0, description="Number of records to skip (for pagination)"),
    limit: int = Query(50, ge=1, le=500, description="Max records to return"),
    from_date: Optional[str] = Query(None, description="Filter from date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Filter to date YYYY-MM-DD"),
    category: Optional[str] = Query(None, description="Filter by category"),
    direction: Optional[str] = Query(None, description="Filter by direction: debit | credit"),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id).order_by(Transaction.date.desc())

    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)
    if category:
        q = q.filter(Transaction.category == category)
    if direction:
        q = q.filter(Transaction.direction == direction)

    total = q.count()
    rows = q.offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "id": f"t{row.id}",
                "date": row.date,
                "merchant": row.merchant,
                "amount": row.amount,
                "category": row.category,
                "direction": row.direction,
                "paymentMode": row.payment_mode,
                "sourceType": row.source_type,
                "notes": row.notes,
            }
            for row in rows
        ],
    }


@router.get("/transactions/summary")
def get_transactions_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    from_date: Optional[str] = Query(None, description="Period start YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Period end YYYY-MM-DD"),
):
    """Period-based aggregate: total spend/credit + category breakdown."""
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)

    all_txns = q.all()
    total_debit = sum(t.amount for t in all_txns if t.direction == "debit")
    total_credit = sum(t.amount for t in all_txns if t.direction == "credit")

    # Category breakdown (debits only)
    cat_q = (
        db.query(Transaction.category, func.sum(Transaction.amount).label("total"))
        .filter(Transaction.user_id == current_user.id, Transaction.direction == "debit")
    )
    if from_date:
        cat_q = cat_q.filter(Transaction.date >= from_date)
    if to_date:
        cat_q = cat_q.filter(Transaction.date <= to_date)

    categories = cat_q.group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()).all()

    return {
        "period": {"from": from_date, "to": to_date},
        "total_spend": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "transaction_count": len(all_txns),
        "category_breakdown": [
            {"category": row.category, "total": round(row.total, 2)}
            for row in categories
        ],
    }


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------
@router.get("/goals")
def get_goals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(SavingsGoal).filter(SavingsGoal.user_id == current_user.id).all()

    emoji_map = {"Emergency Fund": "🛡️", "Goa Trip": "🏖️", "New Laptop": "💻"}
    color_map = {"Emergency Fund": "#5C3D2E", "Goa Trip": "#2563EB", "New Laptop": "#7C3AED"}

    return [
        {
            "id": f"g{row.id}",
            "name": row.name,
            "emoji": emoji_map.get(row.name, "🎯"),
            "targetAmount": row.target_amount,
            "currentAmount": row.current_amount,
            "deadline": row.deadline,
            "color": color_map.get(row.name, "#10B981"),
            "status": row.status,
        }
        for row in rows
    ]


from pydantic import BaseModel

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[str] = None

@router.post("/goals", status_code=201)
def create_goal(
    body: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new savings goal for the authenticated user."""
    goal = SavingsGoal(
        user_id=current_user.id,
        name=body.name,
        target_amount=body.target_amount,
        current_amount=body.current_amount,
        deadline=body.deadline,
        status="active",
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return {"id": goal.id, "name": goal.name, "target_amount": goal.target_amount}


# ---------------------------------------------------------------------------
# Profile — income now derived from income_range
# ---------------------------------------------------------------------------
INCOME_RANGE_MAP = {
    "0-3L": 20000,
    "3-5L": 35000,
    "5-10L": 65000,
    "10-15L": 105000,
    "15-25L": 165000,
    "25L+": 250000,
}

@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = current_user  # JWT-scoped — always the right user

    # Derive monthly income from income_range band; fall back to monthly_budget
    monthly_income = INCOME_RANGE_MAP.get(user.income_range, user.monthly_budget or 0)

    return {
        "name": user.name.split()[0],
        "fullName": user.name,
        "incomeRange": user.income_range,
        "monthlyIncome": monthly_income,
        "stage": user.financial_stage,
        "purposes": user.goal_type.split(",") if user.goal_type else [],
        "monthlyBudget": user.monthly_budget,
    }


class BudgetUpdate(BaseModel):
    monthly_budget: float

@router.post("/profile/budget")
def update_budget(
    body: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update the authenticated user's monthly budget."""
    current_user.monthly_budget = body.monthly_budget
    db.commit()
    return {"monthly_budget": current_user.monthly_budget}


# ---------------------------------------------------------------------------
# Summary (all-time category totals)
# ---------------------------------------------------------------------------
@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """All-time category spend totals for the authenticated user."""
    rows = (
        db.query(Transaction.category, func.sum(Transaction.amount).label("total"))
        .filter(Transaction.user_id == current_user.id, Transaction.direction == "debit")
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    return [{"category": row.category, "total": round(row.total, 2)} for row in rows]


@router.get("/assets")
def get_assets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Asset).filter(Asset.user_id == current_user.id).all()
    return [
        {
            "id": f"a{row.id}",
            "name": row.name,
            "type": row.type,
            "balance": row.value,
            "change": 0.0,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Opportunities / Recommendations
# ---------------------------------------------------------------------------
@router.get("/opportunities")
def get_opportunities(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Recommendation).filter(Recommendation.user_id == current_user.id).all()

    emoji_map = {
        "Safety first": "🛡️",
        "Wealth building": "📈",
        "Quick saving": "💳",
        "You're on track": "🏠",
    }
    color_map = {
        "Safety first": "positive",
        "Wealth building": "filter",
        "Quick saving": "warning",
        "You're on track": "positive",
    }

    return [
        {
            "id": f"op{row.id}",
            "emoji": emoji_map.get(row.tag, "💡"),
            "title": row.title,
            "description": row.description,
            "why": row.why or "",
            "cta": row.cta,
            "tag": row.tag,
            "tagColor": color_map.get(row.tag, "filter"),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Review Queue — transactions pending user review
# ---------------------------------------------------------------------------
@router.get("/review/queue")
def get_review_queue(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return transactions where review_status is 'pending'."""
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id, Transaction.review_status == "pending")
        .order_by(Transaction.date.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": row.id,
            "date": row.date,
            "merchant": row.merchant,
            "amount": row.amount,
            "direction": row.direction,
            "category": row.category,
            "confidence": row.confidence,
            "review_status": row.review_status,
        }
        for row in rows
    ]


