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
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)

    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)
    if category:
        q = q.filter(Transaction.category == category)
    if direction:
        q = q.filter(Transaction.direction == direction)

    rows = q.order_by(Transaction.date.desc(), Transaction.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "data": [
            {
                "id": row.id,
                "date": row.date,
                "merchant": row.merchant,
                "amount": row.amount,
                "direction": row.direction,
                "category": row.category,
                "confidence": row.confidence,
                "review_status": row.review_status,
                "payment_mode": row.payment_mode,
                "notes": row.notes,
                "tags": row.tags,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }

from pydantic import BaseModel
from datetime import datetime

class TransactionCreate(BaseModel):
    amount: float
    merchant: str
    category: str
    date: str
    notes: Optional[str] = None
    direction: str = "debit"
    payment_mode: str = "Cash"
    source_type: str = "Manual"

@router.post("/transactions")
def create_transaction(
    body: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        db_tx = Transaction(
            user_id=current_user.id,
            amount=body.amount,
            merchant=body.merchant,
            category=body.category,
            date=body.date,
            notes=body.notes,
            direction=body.direction,
            payment_mode=body.payment_mode,
            source_type=body.source_type,
            review_status="reviewed", # Auto-approve manual entries
            raw_sms="",
            confidence=1.0
        )
        db.add(db_tx)
        db.commit()
        db.refresh(db_tx)
            
        return {
            "status": "success",
            "data": {
                "id": db_tx.id,
                "amount": db_tx.amount,
                "merchant": db_tx.merchant,
            }
        }
    except Exception as e:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


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

    rows = q.all()

    total_income = 0.0
    total_expense = 0.0

    for row in rows:
        if row.direction == "credit":
            total_income += float(row.amount)
        else:
            total_expense += float(row.amount)

    # Category breakdown (debits only)
    cat_map = {}
    for t in rows:
        if t.direction == "debit":
            cat_map[t.category] = cat_map.get(t.category, 0) + float(t.amount)

    categories = sorted([{"category": k, "total": round(v, 2)} for k, v in cat_map.items()], key=lambda x: x["total"], reverse=True)

    return {
        "period": {"from": from_date, "to": to_date},
        "total_spend": round(total_expense, 2),
        "total_credit": round(total_income, 2),
        "transaction_count": len(rows),
        "category_breakdown": categories,
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
            "autoPayAmount": row.auto_pay_amount,
            "autoPayDate": row.auto_pay_date,
            "autoPayStatus": row.auto_pay_status,
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

class GoalEdit(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    deadline: Optional[str] = None

@router.put("/goals/{goal_id}")
def edit_goal(
    goal_id: int,
    body: GoalEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from fastapi import HTTPException as _HE
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id).first()
    if not goal:
        raise _HE(status_code=404, detail="Goal not found")
    
    if body.name is not None:
        goal.name = body.name
    if body.target_amount is not None:
        goal.target_amount = body.target_amount
    if body.deadline is not None:
        goal.deadline = body.deadline
    
    db.commit()
    return {"status": "success"}

class AddMoney(BaseModel):
    amount: float

@router.post("/goals/{goal_id}/add_money")
def add_money_to_goal(
    goal_id: int,
    body: AddMoney,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from fastapi import HTTPException as _HE
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id).first()
    if not goal:
        raise _HE(status_code=404, detail="Goal not found")
    
    goal.current_amount += body.amount
    # Also add to Dekho Wallet
    current_user.dekho_wallet_balance = (current_user.dekho_wallet_balance or 0.0) + body.amount
    
    db.commit()
    return {"status": "success", "new_amount": goal.current_amount, "dekho_wallet_balance": current_user.dekho_wallet_balance}

class AutoPaySetup(BaseModel):
    auto_pay_amount: float
    auto_pay_date: int
    auto_pay_status: str

@router.put("/goals/{goal_id}/auto_pay")
def setup_auto_pay(
    goal_id: int,
    body: AutoPaySetup,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from fastapi import HTTPException as _HE
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id).first()
    if not goal:
        raise _HE(status_code=404, detail="Goal not found")
    
    goal.auto_pay_amount = body.auto_pay_amount
    goal.auto_pay_date = body.auto_pay_date
    goal.auto_pay_status = body.auto_pay_status
    
    db.commit()
    return {"status": "success"}



# ---------------------------------------------------------------------------
@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = current_user  # JWT-scoped — always the right user
    return {
        "name": user.name.split()[0],
        "fullName": user.name,
        "stage": user.financial_stage,
        "purposes": user.goal_type.split(",") if user.goal_type else [],
        "monthlyBudget": user.monthly_budget,
        "dekhoWalletBalance": user.dekho_wallet_balance or 0.0,
        "streak_days": user.current_streak_days or 0,
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
# Budgets
# ---------------------------------------------------------------------------
from app.models import Budget

DEFAULT_BUDGETS = {
    "Essentials": {
        "subtitle": "NON-NEGOTIABLE",
        "categories": [
            {"label": "Housing & Household", "emoji": "🏠", "budget": 0},
            {"label": "Utilities", "emoji": "⚡", "budget": 0},
            {"label": "Bills", "emoji": "🧾", "budget": 0},
            {"label": "Food & Dining", "emoji": "🍴", "budget": 0},
            {"label": "Groceries", "emoji": "🛒", "budget": 0},
            {"label": "Transport", "emoji": "🚗", "budget": 0},
            {"label": "Health", "emoji": "💊", "budget": 0},
            {"label": "Personal Care", "emoji": "🧴", "budget": 0},
            {"label": "Insurance", "emoji": "🛡️", "budget": 0},
            {"label": "Loan EMI", "emoji": "💳", "budget": 0},
            {"label": "Credit Card", "emoji": "💳", "budget": 0},
        ]
    },
    "Lifestyle": {
        "subtitle": "FLEXIBLE",
        "categories": [
            {"label": "Shopping", "emoji": "🛍️", "budget": 0},
            {"label": "Entertainment", "emoji": "🎬", "budget": 0},
            {"label": "Travel", "emoji": "✈️", "budget": 0},
            {"label": "Subscriptions", "emoji": "📺", "budget": 0},
            {"label": "Telecom", "emoji": "📱", "budget": 0},
        ]
    },
    "Future-oriented": {
        "subtitle": "GOALS",
        "categories": [
            {"label": "Investment", "emoji": "💰", "budget": 0},
        ]
    },
    "Buffer": {
        "subtitle": "FLEXIBILITY",
        "categories": [
            {"label": "Others", "emoji": "🔮", "budget": 0},
            {"label": "Services", "emoji": "🛠️", "budget": 0},
            {"label": "Uncategorised", "emoji": "❓", "budget": 0},
        ]
    }
}

@router.get("/budgets")
def get_budgets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if user has any budgets
    rows = db.query(Budget).filter(Budget.user_id == current_user.id).all()
    if not rows:
        # Seed defaults
        import datetime
        current_month = datetime.date.today().strftime("%Y-%m")
        for section, data in DEFAULT_BUDGETS.items():
            for cat in data["categories"]:
                b = Budget(
                    user_id=current_user.id,
                    section=section,
                    category=cat["label"] + "|" + cat["emoji"],
                    monthly_limit=cat["budget"],
                    month=current_month
                )
                db.add(b)
        db.commit()
        rows = db.query(Budget).filter(Budget.user_id == current_user.id).all()

    # Get spent amount for current month
    import datetime
    current_month_str = datetime.date.today().strftime("%Y-%m")
    tx_rows = db.query(Transaction.category, func.sum(Transaction.amount).label("spent")).filter(
        Transaction.user_id == current_user.id,
        Transaction.direction == "debit",
        Transaction.date.startswith(current_month_str)
    ).group_by(Transaction.category).all()
    
    spent_map = {row.category: row.spent for row in tx_rows}

    # Group by section
    section_map = {}
    known_labels = set()
    label_to_item = {}
    for r in rows:
        if r.section not in section_map:
            section_map[r.section] = []
        
        parts = r.category.split("|")
        label = parts[0]
        emoji = parts[1] if len(parts) > 1 else "📌"
        
        amt = spent_map.get(label, 0.0)
        item = {
            "label": label,
            "emoji": emoji,
            "amount": amt,
            "budget": r.monthly_limit,
            "match": [label]
        }
        section_map[r.section].append(item)
        known_labels.add(label)
        label_to_item[label] = item

    # Any spent categories not in known_labels go to Buffer, or fuzzy match
    for label, amt in spent_map.items():
        if label not in known_labels:
            matched_kl = None
            for kl in known_labels:
                if label.lower() in kl.lower() or kl.lower() in label.lower():
                    matched_kl = kl
                    break
            
            if matched_kl:
                label_to_item[matched_kl]["amount"] += amt
            else:
                if "Buffer" not in section_map:
                    section_map["Buffer"] = []
                section_map["Buffer"].append({
                    "label": label,
                    "emoji": "❓",
                    "amount": amt,
                    "budget": 0.0,
                    "match": [label]
                })

    result = []
    # Preserve order
    for s in ["Essentials", "Lifestyle", "Future-oriented", "Buffer"]:
        if s in section_map:
            subs = section_map[s]
            total_budget = sum([c["budget"] for c in subs])
            total_spent = sum([c["amount"] for c in subs])
            result.append({
                "label": s,
                "subtitle": DEFAULT_BUDGETS.get(s, {}).get("subtitle", ""),
                "spent": total_spent,
                "budget": total_budget,
                "subcategories": subs
            })
    return result

class CategoryCreateOrUpdate(BaseModel):
    section: str
    label: str
    emoji: str
    budget: float

@router.post("/budgets/category")
def create_or_update_budget_category(
    body: CategoryCreateOrUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import datetime
    current_month = datetime.date.today().strftime("%Y-%m")
    category_full = f"{body.label}|{body.emoji}"
    
    b = db.query(Budget).filter(
        Budget.user_id == current_user.id, 
        Budget.category.startswith(body.label + "|")
    ).first()
    
    if b:
        b.monthly_limit = body.budget
        b.category = category_full # in case emoji changed
    else:
        b = Budget(
            user_id=current_user.id,
            section=body.section,
            category=category_full,
            monthly_limit=body.budget,
            month=current_month
        )
        db.add(b)
    db.commit()
    return {"status": "success"}

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
        .filter(Transaction.user_id == current_user.id, Transaction.review_status == "needs_review")
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
            "raw_sms": row.raw_sms,
        }
        for row in rows
    ]



# ---------------------------------------------------------------------------
# Delete transaction (JWT-scoped)
# ---------------------------------------------------------------------------
@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException as _HE
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise _HE(status_code=404, detail="Transaction not found")
    db.delete(tx); db.commit()
    return None


# ---------------------------------------------------------------------------
# Delete goal (JWT-scoped)
# ---------------------------------------------------------------------------
@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException as _HE
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id).first()
    if not goal:
        raise _HE(status_code=404, detail="Goal not found")
    db.delete(goal); db.commit()
    return None
