"""
FeatureService — computes and returns reusable financial metrics from the
canonical transactions table. These features are consumed by ML models
and the chatbot context builder.

All methods return plain Python dicts (no ORM objects) so they can be
serialised directly as JSON or passed to ML inference.
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.models import Transaction, SavingsGoal, IncomeEntry, Budget


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ratio(part: float, total: float) -> float:
    return round(part / total, 4) if total else 0.0


def _detect_recurring(transactions: List[Transaction], threshold: int = 2) -> List[Dict]:
    """
    Identify merchants that appear ≥ threshold times in the given list.
    Returns a list of {merchant, count, avg_amount} dicts.
    """
    freq: Dict[str, List[float]] = defaultdict(list)
    for t in transactions:
        freq[t.merchant].append(t.amount)

    recurring = []
    for merchant, amounts in freq.items():
        if len(amounts) >= threshold:
            recurring.append({
                "merchant": merchant,
                "count": len(amounts),
                "avg_amount": round(sum(amounts) / len(amounts), 2),
            })

    return sorted(recurring, key=lambda x: x["count"], reverse=True)


# ---------------------------------------------------------------------------
# FeatureService
# ---------------------------------------------------------------------------

class FeatureService:
    """
    Computes financial features for a given user from their transaction history.
    Results are dicts ready for JSON serialisation or ML consumption.
    """

    # ------------------------------------------------------------------
    # Monthly Features
    # ------------------------------------------------------------------
    def compute_monthly_features(
        self, db: Session, user_id: int, month: str  # "YYYY-MM"
    ) -> Dict[str, Any]:
        """
        Compute aggregated features for a single calendar month.

        Returns:
            month: str
            total_spend: float
            total_credit: float
            category_breakdown: {category: amount}
            category_ratios: {category: ratio_of_total}
            top_categories: list of (category, amount) sorted desc
            savings_rate: float (credit - debit) / credit
            income_estimate: float (sum of credit transactions)
            recurring_expenses: list of {merchant, count, avg_amount}
            transaction_count: int
            avg_transaction: float
            budget_utilization: {category: {budget, spent, pct}}
        """
        try:
            year_int, month_int = map(int, month.split("-"))
        except ValueError:
            raise ValueError(f"month must be 'YYYY-MM', got: {month!r}")

        # All transactions in this month for this user
        txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                extract("year", Transaction.date) == year_int,
                extract("month", Transaction.date) == month_int,
            )
            .all()
        )

        debit_txns = [t for t in txns if t.direction == "debit"]
        credit_txns = [t for t in txns if t.direction == "credit"]

        total_spend = sum(t.amount for t in debit_txns)
        total_credit = sum(t.amount for t in credit_txns)

        # Category breakdown (debits only)
        cat_totals: Dict[str, float] = defaultdict(float)
        for t in debit_txns:
            cat_totals[t.category] += t.amount

        category_breakdown = dict(sorted(cat_totals.items(), key=lambda x: x[1], reverse=True))
        category_ratios = {cat: _ratio(amt, total_spend) for cat, amt in category_breakdown.items()}
        top_categories = list(category_breakdown.items())[:5]

        savings_rate = _ratio(total_credit - total_spend, total_credit) if total_credit else 0.0
        income_estimate = total_credit

        recurring = _detect_recurring(debit_txns)

        # Budget utilization (if budgets exist for this month)
        budgets = db.query(Budget).filter(
            Budget.user_id == user_id,
            Budget.month == month
        ).all()

        budget_util: Dict[str, Dict] = {}
        for b in budgets:
            spent = cat_totals.get(b.category, 0.0)
            budget_util[b.category] = {
                "budget": b.monthly_limit,
                "spent": round(spent, 2),
                "pct": _ratio(spent, b.monthly_limit) * 100,
            }

        return {
            "month": month,
            "total_spend": round(total_spend, 2),
            "total_credit": round(total_credit, 2),
            "category_breakdown": {k: round(v, 2) for k, v in category_breakdown.items()},
            "category_ratios": category_ratios,
            "top_categories": [{"category": c, "amount": round(a, 2)} for c, a in top_categories],
            "savings_rate": savings_rate,
            "income_estimate": round(income_estimate, 2),
            "recurring_expenses": recurring,
            "transaction_count": len(txns),
            "avg_transaction": round(total_spend / len(debit_txns), 2) if debit_txns else 0.0,
            "budget_utilization": budget_util,
        }

    # ------------------------------------------------------------------
    # Weekly Features
    # ------------------------------------------------------------------
    def compute_weekly_features(
        self, db: Session, user_id: int, week: str  # "YYYY-WNN" e.g. "2026-W17"
    ) -> Dict[str, Any]:
        """
        Compute spend breakdown for a single ISO calendar week.

        Returns:
            week: str
            week_start: str (YYYY-MM-DD Monday)
            week_end: str (YYYY-MM-DD Sunday)
            total_spend: float
            daily_spend: {YYYY-MM-DD: amount}
            category_breakdown: {category: amount}
            transaction_count: int
        """
        try:
            year_str, week_str = week.split("-W")
            year_int = int(year_str)
            week_int = int(week_str)
        except ValueError:
            raise ValueError(f"week must be 'YYYY-WNN', got: {week!r}")

        # Compute Monday and Sunday of the week
        monday = datetime.strptime(f"{year_int}-W{week_int:02d}-1", "%Y-W%W-%w").date()
        sunday = monday + timedelta(days=6)

        txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.date >= monday.isoformat(),
                Transaction.date <= sunday.isoformat(),
                Transaction.direction == "debit",
            )
            .all()
        )

        total_spend = sum(t.amount for t in txns)

        daily: Dict[str, float] = defaultdict(float)
        for t in txns:
            daily[str(t.date)] += t.amount

        # Fill in 0 for missing days
        daily_spend = {}
        for i in range(7):
            d = (monday + timedelta(days=i)).isoformat()
            daily_spend[d] = round(daily.get(d, 0.0), 2)

        cat_totals: Dict[str, float] = defaultdict(float)
        for t in txns:
            cat_totals[t.category] += t.amount

        return {
            "week": week,
            "week_start": monday.isoformat(),
            "week_end": sunday.isoformat(),
            "total_spend": round(total_spend, 2),
            "daily_spend": daily_spend,
            "category_breakdown": {k: round(v, 2) for k, v in
                                   sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)},
            "transaction_count": len(txns),
        }

    # ------------------------------------------------------------------
    # User Financial Profile
    # ------------------------------------------------------------------
    def compute_user_profile(
        self, db: Session, user_id: int, months: int = 3
    ) -> Dict[str, Any]:
        """
        Compute a rolling financial profile over the last N months.

        Returns:
            lookback_months: int
            avg_monthly_spend: float
            avg_monthly_credit: float
            avg_savings_rate: float
            dominant_categories: top 5 spend categories over period
            recurring_merchants: merchants appearing most often
            spending_trend: list of {month, total_spend} sorted chronologically
            goals_summary: list of active savings goals with progress %
        """
        today = date.today()

        # Collect the last N months of transactions
        cutoff = today.replace(day=1)
        for _ in range(months - 1):
            cutoff = (cutoff - timedelta(days=1)).replace(day=1)

        all_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.date >= cutoff.isoformat(),
            )
            .all()
        )

        debit_txns = [t for t in all_txns if t.direction == "debit"]
        credit_txns = [t for t in all_txns if t.direction == "credit"]

        total_spend = sum(t.amount for t in debit_txns)
        total_credit = sum(t.amount for t in credit_txns)

        avg_monthly_spend = round(total_spend / months, 2)
        avg_monthly_credit = round(total_credit / months, 2)
        avg_savings_rate = _ratio(total_credit - total_spend, total_credit) if total_credit else 0.0

        # Dominant categories
        cat_totals: Dict[str, float] = defaultdict(float)
        for t in debit_txns:
            cat_totals[t.category] += t.amount

        dominant_categories = [
            {"category": c, "amount": round(a, 2), "pct": _ratio(a, total_spend) * 100}
            for c, a in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        recurring_merchants = _detect_recurring(debit_txns, threshold=2)[:5]

        # Monthly spend trend
        monthly_spend: Dict[str, float] = defaultdict(float)
        for t in debit_txns:
            month_key = str(t.date)[:7]  # "YYYY-MM"
            monthly_spend[month_key] += t.amount

        spending_trend = [
            {"month": m, "total_spend": round(v, 2)}
            for m, v in sorted(monthly_spend.items())
        ]

        # Goals summary
        goals = db.query(SavingsGoal).filter(
            SavingsGoal.user_id == user_id,
            SavingsGoal.status == "active"
        ).all()

        goals_summary = [
            {
                "name": g.name,
                "target": g.target_amount,
                "current": g.current_amount,
                "progress_pct": _ratio(g.current_amount, g.target_amount) * 100,
                "deadline": g.deadline,
            }
            for g in goals
        ]

        return {
            "lookback_months": months,
            "avg_monthly_spend": avg_monthly_spend,
            "avg_monthly_credit": avg_monthly_credit,
            "avg_savings_rate": avg_savings_rate,
            "dominant_categories": dominant_categories,
            "recurring_merchants": recurring_merchants,
            "spending_trend": spending_trend,
            "goals_summary": goals_summary,
        }


# Singleton
feature_service = FeatureService()
