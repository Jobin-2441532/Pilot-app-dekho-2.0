"""
Features API — exposes computed financial metrics for use by the frontend
and ML services. All endpoints are JWT-protected.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User
from app.services.feature_service import feature_service
from app.api.endpoints.auth import get_current_user

router = APIRouter()


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _current_week() -> str:
    today = date.today()
    return f"{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}"


@router.get("/monthly")
def get_monthly_features(
    month: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return aggregated financial features for a calendar month.
    Query param: `month=YYYY-MM` (defaults to current month)
    """
    month = month or _current_month()
    try:
        return feature_service.compute_monthly_features(db, current_user.id, month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/weekly")
def get_weekly_features(
    week: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return spend breakdown for an ISO calendar week.
    Query param: `week=YYYY-WNN` e.g. `2026-W17` (defaults to current week)
    """
    week = week or _current_week()
    try:
        return feature_service.compute_weekly_features(db, current_user.id, week)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/profile")
def get_user_profile(
    months: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return a rolling financial profile over the last N months.
    Query param: `months=3` (default)
    """
    if months < 1 or months > 24:
        raise HTTPException(status_code=400, detail="months must be between 1 and 24")
    return feature_service.compute_user_profile(db, current_user.id, months)

