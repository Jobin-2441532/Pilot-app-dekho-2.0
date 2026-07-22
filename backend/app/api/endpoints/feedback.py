"""
Feedback API — user category correction workflow.
Every correction is logged to feedback_logs and upserted into merchant_mappings.
When 5+ corrections accumulate, ML retraining can be triggered.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from pydantic import BaseModel

from app.core.database import get_db
from app.models import User, Transaction, MerchantMapping, FeedbackLog
from app.api.endpoints.auth import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CategoryCorrection(BaseModel):
    transaction_id: int
    corrected_category: str
    corrected_sub_category: str = ""


# ---------------------------------------------------------------------------
# POST /feedback/correct
# ---------------------------------------------------------------------------
@router.post("/correct", status_code=201)
def correct_category(
    body: CategoryCorrection,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record a user's category correction for a transaction.
    - Logs to feedback_logs
    - Upserts into merchant_mappings (so next time this merchant is auto-classified correctly)
    - Updates the transaction's category + review_status
    """
    tx = db.query(Transaction).filter(
        Transaction.id == body.transaction_id,
        Transaction.user_id == current_user.id   # isolation — own txns only
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    original_category = tx.category or "Uncategorized"

    # 1. Log the correction
    log = FeedbackLog(
        user_id=current_user.id,
        transaction_id=tx.id,
        original_category=original_category,
        corrected_category=body.corrected_category,
        original_confidence=tx.confidence or 0.0,
    )
    db.add(log)

    # 2. Upsert merchant_mappings so future SMS from same merchant gets right category
    if tx.merchant:
        merchant_key = tx.merchant.strip().lower()
        existing = db.query(MerchantMapping).filter(
            MerchantMapping.user_id == current_user.id,
            MerchantMapping.merchant_key == merchant_key,
        ).first()

        if existing:
            existing.category = body.corrected_category
            existing.sub_category = body.corrected_sub_category
            existing.usage_count += 1
        else:
            mapping = MerchantMapping(
                user_id=current_user.id,
                merchant_key=merchant_key,
                category=body.corrected_category,
                sub_category=body.corrected_sub_category,
                confidence_override=1.0,
                usage_count=1,
            )
            db.add(mapping)

    # 3. Update the transaction itself
    tx.category = body.corrected_category
    tx.sub_category = body.corrected_sub_category
    tx.review_status = "reviewed"
    tx.confidence = 1.0
    
    # PMF Analytics tracking fields
    from datetime import datetime, timezone
    tx.was_corrected = True
    tx.corrected_at = datetime.now(timezone.utc)

    db.commit()

    # Check if retraining threshold met (5+ corrections)
    correction_count = db.query(FeedbackLog).filter(
        FeedbackLog.user_id == current_user.id
    ).count()

    return {
        "status": "ok",
        "transaction_id": tx.id,
        "new_category": body.corrected_category,
        "correction_count": correction_count,
        "retrain_ready": correction_count >= 5,
    }


# ---------------------------------------------------------------------------
# GET /feedback/stats
# ---------------------------------------------------------------------------
@router.get("/stats")
def get_feedback_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stats on how many corrections have been made."""
    total = db.query(FeedbackLog).filter(FeedbackLog.user_id == current_user.id).count()
    mappings = db.query(MerchantMapping).filter(MerchantMapping.user_id == current_user.id).count()

    return {
        "total_corrections": total,
        "merchant_mappings_learned": mappings,
        "retrain_ready": total >= 5,
        "corrections_until_retrain": max(0, 5 - total),
    }


# ---------------------------------------------------------------------------
# GET /feedback/merchant-mappings
# ---------------------------------------------------------------------------
@router.get("/merchant-mappings")
def get_merchant_mappings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all learned merchant → category mappings for the authenticated user."""
    rows = db.query(MerchantMapping).filter(
        MerchantMapping.user_id == current_user.id
    ).order_by(MerchantMapping.usage_count.desc()).all()

    return [
        {
            "merchant_key": r.merchant_key,
            "category": r.category,
            "sub_category": r.sub_category,
            "usage_count": r.usage_count,
            "confidence_override": r.confidence_override,
        }
        for r in rows
    ]
class AppFeedbackCreate(BaseModel):
    feedback_type: str
    title: str = None
    description: str
    expected_behavior: str = None
    device_info: str = None
    rating: int = None

@router.post("/app", status_code=201)
def submit_app_feedback(
    body: AppFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.feedback import AppFeedback
    fb = AppFeedback(
        user_id=current_user.id,
        feedback_type=body.feedback_type,
        title=body.title,
        description=body.description,
        expected_behavior=body.expected_behavior,
        device_info=body.device_info,
        rating=body.rating,
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback submitted successfully"}
