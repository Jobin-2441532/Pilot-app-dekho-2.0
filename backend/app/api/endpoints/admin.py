from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.models import User, Transaction, RawRecord, UploadedFile, Budget
from app.api.endpoints.auth import get_current_user

router = APIRouter()

def verify_admin(
    x_admin_user: str = Header(None, alias="X-Admin-User"),
    x_admin_pass: str = Header(None, alias="X-Admin-Pass")
):
    if x_admin_user != "kulkarni99" or x_admin_pass != "iamironman@iloveyou3000":
        raise HTTPException(status_code=403, detail="Forbidden: Invalid admin credentials")

# ── GET /api/v1/admin/stats ───────────────────────────────────────────────
@router.get("/stats", dependencies=[Depends(verify_admin)])
def get_admin_stats(
    db: Session = Depends(get_db)
):
    """Return overall metrics of the system for admin dashboard."""
    # Note: In a production app, we would verify if current_user.is_admin is True.
    # For this pilot, any authenticated user can view the admin stats to test it.
    
    total_users = db.query(User).count()
    total_transactions = db.query(Transaction).count()
    total_sms = db.query(RawRecord).filter(RawRecord.source_type == "sms").count()
    total_files = db.query(UploadedFile).count()
    
    total_debit = db.query(func.sum(Transaction.amount)).filter(Transaction.direction == "debit").scalar() or 0.0
    total_credit = db.query(func.sum(Transaction.amount)).filter(Transaction.direction == "credit").scalar() or 0.0

    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "total_sms": total_sms,
        "total_files": total_files,
        "volume_debit": round(total_debit, 2),
        "volume_credit": round(total_credit, 2),
    }

# ── GET /api/v1/admin/users ───────────────────────────────────────────────
@router.get("/users", dependencies=[Depends(verify_admin)])
def get_admin_users(
    db: Session = Depends(get_db)
):
    """Return summary list of all registered users and their transaction/SMS counts."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    
    user_list = []
    for u in users:
        tx_count = db.query(Transaction).filter(Transaction.user_id == u.id).count()
        sms_count = db.query(RawRecord).filter(RawRecord.user_id == u.id, RawRecord.source_type == "sms").count()
        file_count = db.query(UploadedFile).filter(UploadedFile.user_id == u.id).count()
        
        user_list.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "monthly_budget": u.monthly_budget,
            "goal_type": u.goal_type,
            "risk_comfort": u.risk_comfort,
            "financial_stage": u.financial_stage,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "transaction_count": tx_count,
            "sms_count": sms_count,
            "file_count": file_count
        })
        
    return user_list

# ── GET /api/v1/admin/users/{user_id}/details ─────────────────────────────
@router.get("/users/{user_id}/details", dependencies=[Depends(verify_admin)])
def get_user_admin_details(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Return detailed financial and raw data profile of a specific user."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, f"User with ID {user_id} not found")
        
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id).order_by(Transaction.date.desc()).all()
    sms_logs = db.query(RawRecord).filter(RawRecord.user_id == user_id, RawRecord.source_type == "sms").order_by(RawRecord.created_at.desc()).all()
    
    # Calculate category breakdown
    category_totals = db.query(
        Transaction.category,
        func.sum(Transaction.amount)
    ).filter(
        Transaction.user_id == user_id,
        Transaction.direction == "debit"
    ).group_by(
        Transaction.category
    ).all()
    
    breakdown = [{"category": cat or "Uncategorised", "amount": round(total, 2)} for cat, total in category_totals]
    breakdown = sorted(breakdown, key=lambda x: x["amount"], reverse=True)
    
    tx_list = []
    for t in transactions:
        tx_list.append({
            "id": t.id,
            "date": t.date,
            "merchant": t.merchant or "Unknown",
            "amount": t.amount,
            "direction": t.direction or "debit",
            "category": t.category or "Uncategorised",
            "payment_mode": t.payment_mode or "UPI",
            "confidence": t.confidence,
            "review_status": t.review_status or "pending",
            "created_at": t.created_at.isoformat() if t.created_at else None
        })
        
    sms_list = []
    for s in sms_logs:
        sms_list.append({
            "id": s.id,
            "raw_text": s.raw_text,
            "parsed_status": s.parsed_status or "pending",
            "created_at": s.created_at.isoformat() if s.created_at else None
        })

    # Calculate stats
    cat_spent = {cat: amount for cat, amount in category_totals}
    budgets = db.query(Budget).filter(Budget.user_id == user_id).all()
    total_budgets = len(budgets)
    safe_budgets = 0
    for b in budgets:
        spent = cat_spent.get(b.category, 0)
        if spent < b.monthly_limit + 1:
            safe_budgets += 1
            
    unique_days = len(set(t.date for t in transactions))
    chat_sessions_count = 0

    return {
        "user": {
            "id": target_user.id,
            "name": target_user.name,
            "email": target_user.email,
            "monthly_budget": target_user.monthly_budget,
            "goal_type": target_user.goal_type,
            "risk_comfort": target_user.risk_comfort,
            "financial_stage": target_user.financial_stage,
            "created_at": target_user.created_at.isoformat() if target_user.created_at else None,
            "stats": {
                "streak_days": target_user.current_streak_days,
                "spends_logged": len(transactions),
                "safe_budgets": f"{safe_budgets}/{total_budgets}",
                "check_ins": unique_days,
                "ai_chats": chat_sessions_count
            }
        },
        "transactions": tx_list,
        "sms_logs": sms_list,
        "category_breakdown": breakdown
    }

# ── GET /api/v1/admin/feedback ───────────────────────────────────────────────
@router.get("/feedback", dependencies=[Depends(verify_admin)])
def get_admin_feedback(
    db: Session = Depends(get_db)
):
    from app.models.feedback import AppFeedback
    feedbacks = db.query(AppFeedback).order_by(AppFeedback.created_at.desc()).all()
    
    result = []
    for fb in feedbacks:
        user_name = fb.user.name if fb.user else "Unknown"
        user_email = fb.user.email if fb.user else "Unknown"
        result.append({
            "id": fb.id,
            "user_name": user_name,
            "user_email": user_email,
            "feedback_type": fb.feedback_type,
            "title": fb.title,
            "description": fb.description,
            "expected_behavior": fb.expected_behavior,
            "device_info": fb.device_info,
            "rating": fb.rating,
            "created_at": fb.created_at.isoformat() if fb.created_at else None
        })
    return result
