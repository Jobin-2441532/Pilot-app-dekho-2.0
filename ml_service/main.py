"""
Dekho ML Sidecar — port 8001
============================
Standalone FastAPI service for SMS classification, spending insights,
and transaction pattern analysis.

The main backend (port 8000) proxies all /api/v1/ml/* requests here.
This service is auth-free — auth is enforced by the main backend proxy.

Endpoints:
    GET  /health
    POST /api/sms/ingest          — parse + classify a bank SMS
    GET  /api/insights/monthly-summary
    GET  /api/insights/recurring
    GET  /api/insights/top-merchants
    GET  /api/insights/festival-context
    GET  /api/insights/cashback-savings
    POST /api/feedback/correct    — user category correction (learning)
    GET  /api/review/queue        — low-confidence transactions
    GET  /api/users/ml/pattern/{user_id}
"""

import sys
import traceback

try:
    import os
import re
import logging
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the backend directory (sibling of ml_service)
_env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=_env_path)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s")
logger = logging.getLogger("dekho.ml")

# ── DB connection ─────────────────────────────────────────────────────────────
_DB_URL = os.getenv("DATABASE_URL", "postgresql://dekho:dekho_password@localhost:5432/dekho_db")

def get_conn():
    """Return a psycopg2 connection using DATABASE_URL from environment."""
    try:
        conn = psycopg2.connect(_DB_URL)
        return conn
    except Exception as e:
        raise HTTPException(503, f"Database connection failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Dekho ML Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# SMS Parser (regex-based, covers major Indian bank formats)
# ─────────────────────────────────────────────────────────────────────────────
FAILED_KEYWORDS = [
    "failed", "declined", "not successful", "rejected", "reversed",
    "insufficient", "could not", "unable to", "unsuccessful", "reversal",
    "blocked", "fraud", "suspicious",
]

SMS_PATTERNS = [
    # Debit patterns
    {"regex": r"(?:rs\.?|inr\.?|₹)\s*([\d,]+\.?\d*)\s+debited",                        "direction": "debit"},
    {"regex": r"debited\s+(?:by|with|of)?\s*(?:rs\.?|inr\.?|₹)?\s*([\d,]+\.?\d*)",     "direction": "debit"},
    {"regex": r"(?:spent|paid|sent)\s+(?:rs\.?|inr\.?|₹)\s*([\d,]+\.?\d*)",            "direction": "debit"},
    {"regex": r"(?:amount|amt)\s+of\s+(?:inr|rs\.?|₹)\s*([\d,]+\.?\d*)\s+(?:spent|debited|paid)", "direction": "debit"},
    # Credit patterns
    {"regex": r"(?:rs\.?|inr\.?|₹)\s*([\d,]+\.?\d*)\s+credited",                       "direction": "credit"},
    {"regex": r"credited\s+(?:by|with|of)?\s*(?:rs\.?|inr\.?|₹)?\s*([\d,]+\.?\d*)",   "direction": "credit"},
    {"regex": r"received\s+(?:rs\.?|inr\.?|₹)\s*([\d,]+\.?\d*)",                       "direction": "credit"},
]

MERCHANT_PATTERNS = [
    r"(?:to|at|from|via)\s+([A-Z][A-Z0-9\s\-&]+?)(?:\s+on|\s+ref|\s+\.|$)",
    r"at\s+([A-Z][A-Za-z0-9\s\-&]+?)(?:\s+on|\s+via|\.|$)",
    r"(ZOMATO|SWIGGY|AMAZON|FLIPKART|UBER|OLA|NETFLIX|SPOTIFY|PAYTM|PHONEPE|GPAY|GOOGLE PAY|HDFC|ICICI|SBI|AXIS|KOTAK|AIRTEL|JIO|BSNL|ELECTRICITY|DMart|BIGBASKET|MEESHO|MYNTRA|NYKAA|RAPIDO)",
]

CATEGORY_MAP = {
    "zomato":       ("Food & Dining",  "Food Delivery"),
    "swiggy":       ("Food & Dining",  "Food Delivery"),
    "dominos":      ("Food & Dining",  "Restaurants"),
    "mcdonalds":    ("Food & Dining",  "Restaurants"),
    "kfc":          ("Food & Dining",  "Restaurants"),
    "starbucks":    ("Food & Dining",  "Cafe"),
    "uber":         ("Transport",      "Cab"),
    "ola":          ("Transport",      "Cab"),
    "rapido":       ("Transport",      "Bike Taxi"),
    "irctc":        ("Travel",         "Train"),
    "makemytrip":   ("Travel",         "Booking"),
    "goibibo":      ("Travel",         "Booking"),
    "amazon":       ("Shopping",       "Online"),
    "flipkart":     ("Shopping",       "Online"),
    "myntra":       ("Shopping",       "Clothing"),
    "nykaa":        ("Shopping",       "Beauty"),
    "meesho":       ("Shopping",       "Online"),
    "netflix":      ("Entertainment",  "Streaming"),
    "spotify":      ("Entertainment",  "Music"),
    "hotstar":      ("Entertainment",  "Streaming"),
    "youtube":      ("Entertainment",  "Streaming"),
    "electricity":  ("Utilities",      "Electricity"),
    "bescom":       ("Utilities",      "Electricity"),
    "tata power":   ("Utilities",      "Electricity"),
    "airtel":       ("Telecom",        "Mobile"),
    "jio":          ("Telecom",        "Mobile"),
    "bsnl":         ("Telecom",        "Broadband"),
    "vodafone":     ("Telecom",        "Mobile"),
    "dmart":        ("Groceries",      "Supermarket"),
    "bigbasket":    ("Groceries",      "Online Grocery"),
    "zepto":        ("Groceries",      "Quick Commerce"),
    "blinkit":      ("Groceries",      "Quick Commerce"),
    "grofers":      ("Groceries",      "Online Grocery"),
    "lic":          ("Insurance",      "Life"),
    "hdfc life":    ("Insurance",      "Life"),
    "emi":          ("Loan EMI",       "General"),
    "loan":         ("Loan EMI",       "General"),
    "salary":       ("Income",         "Salary"),
    "refund":       ("Refund",         "General"),
    "atm":          ("Cash Withdrawal","ATM"),
    "gym":          ("Health",         "Fitness"),
    "pharmacy":     ("Health",         "Medicines"),
    "apollo":       ("Health",         "Hospital"),
    "hospital":     ("Health",         "Medical"),
    "clinic":       ("Health",         "Medical"),
}

DATE_FORMATS = [
    "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y", "%d/%m/%y",
    "%d%b%y", "%d%b%Y", "%d-%b-%Y", "%d-%b-%y",
    "%d %b %Y", "%d %b %y",
]


def _is_failed(text: str) -> bool:
    tl = text.lower()
    return any(k in tl for k in FAILED_KEYWORDS)


def _parse_amount(text: str) -> Optional[float]:
    for p in SMS_PATTERNS:
        m = re.search(p["regex"], text, re.IGNORECASE)
        if m:
            try:
                return float(re.sub(r"[,\s]", "", m.group(1))), p["direction"]
            except Exception:
                continue
    return None, None


# Words that should NEVER be treated as merchant names
_SKIP_WORDS = {
    'upi', 'neft', 'imps', 'rtgs', 'atm', 'pos', 'vpa', 'a/c', 'ac', 'ref',
    'bank', 'account', 'bal', 'balance', 'avail', 'available', 'info',
    'your', 'from', 'via', 'to', 'at', 'on', 'by', 'with', 'of',
}

def _extract_merchant(text: str) -> str:
    # First try exact brand matches (most reliable)
    brand_re = r'(ZOMATO|SWIGGY|AMAZON|FLIPKART|UBER|OLA|RAPIDO|NETFLIX|SPOTIFY|HOTSTAR|PAYTM|PHONEPE|GPAY|GOOGLE PAY|AIRTEL|JIO|BSNL|VODAFONE|BESCOM|TATA POWER|DMART|BIGBASKET|ZEPTO|BLINKIT|GROFERS|MYNTRA|NYKAA|MEESHO|IRCTC|MAKEMYTRIP|GOIBIBO|HDFC|ICICI|SBI|AXIS|KOTAK|LIC|APOLLO)'
    m = re.search(brand_re, text, re.IGNORECASE)
    if m:
        return m.group(1).title()

    # Try VPA handle — extract part before @ as merchant (e.g. zomato@upi → Zomato)
    vpa_m = re.search(r'([a-z0-9][a-z0-9._-]{2,})@([a-z]+)', text, re.IGNORECASE)
    if vpa_m:
        name = vpa_m.group(1).replace('.', ' ').replace('_', ' ').replace('-', ' ').strip()
        if name.lower() not in _SKIP_WORDS and len(name) > 2:
            return name.title()

    # Generic pattern — grab capitalised words after prepositions
    for pattern in [
        r'(?:to|at|from)\s+([A-Z][A-Za-z0-9\s\-&]{2,25}?)(?:\s+on|\s+ref|\s+\.|\s+via|$)',
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            raw = re.sub(r'@\w+', '', raw).strip()  # remove VPA suffix
            if raw.lower() not in _SKIP_WORDS and len(raw) > 2:
                return raw.title()

    return 'Unknown'


def _parse_date_from_sms(text: str) -> str:
    """Extract date from SMS. If not found or older than 60 days, use today."""
    date_regex = r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s?[A-Za-z]{3}\s?\d{2,4})\b"
    m = re.search(date_regex, text)
    if m:
        raw = m.group(1).strip()
        for fmt in DATE_FORMATS:
            try:
                parsed = datetime.strptime(raw, fmt).date()
                # If date is more than 60 days old, use today (sample/demo SMS protection)
                if (date.today() - parsed).days > 60:
                    return date.today().isoformat()
                return parsed.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return date.today().isoformat()


def _classify_category(merchant: str, description: str) -> tuple[str, str, float]:
    """Return (category, sub_category, confidence)."""
    combined = (merchant + " " + description).lower()
    for keyword, (cat, sub) in CATEGORY_MAP.items():
        if keyword in combined:
            return cat, sub, 0.88
    # Heuristic fallbacks
    if any(k in combined for k in ["upi", "transfer", "neft", "imps", "rtgs"]):
        return "Personal Transfer", "UPI", 0.60
    if any(k in combined for k in ["credit card", "card payment", "cc bill"]):
        return "Credit Card", "Payment", 0.75
    if any(k in combined for k in ["insurance", "premium"]):
        return "Insurance", "General", 0.70
    return "Uncategorised", "General", 0.45


def classify_sms(sms_text: str) -> Dict[str, Any]:
    """Full SMS → transaction classification pipeline."""
    if _is_failed(sms_text):
        return {"error": "failed_transaction", "detail": "SMS describes a failed/declined transaction"}

    amount, direction = _parse_amount(sms_text)
    if not amount:
        return {"error": "parse_failed", "detail": "Could not extract amount from SMS"}

    merchant = _extract_merchant(sms_text)
    tx_date  = _parse_date_from_sms(sms_text)
    category, sub_category, confidence = _classify_category(merchant, sms_text)

    # Detect payment method
    payment_mode = "UPI"
    if re.search(r"credit card|cc\b", sms_text, re.IGNORECASE):
        payment_mode = "Credit Card"
    elif re.search(r"debit card|atm card", sms_text, re.IGNORECASE):
        payment_mode = "Debit Card"
    elif re.search(r"netbanking|net banking|neft|imps|rtgs", sms_text, re.IGNORECASE):
        payment_mode = "Net Banking"
    elif re.search(r"wallet|paytm|phonepe|gpay", sms_text, re.IGNORECASE):
        payment_mode = "Wallet"

    # Detect VPA
    vpa_match = re.search(r"[a-z0-9.\-_]+@[a-z]+", sms_text, re.IGNORECASE)
    vpa = vpa_match.group(0) if vpa_match else None

    return {
        "amount":       amount,
        "direction":    direction,
        "merchant":     merchant,
        "date":         tx_date,
        "category":     category,
        "sub_category": sub_category,
        "confidence":   confidence,
        "payment_mode": payment_mode,
        "vpa":          vpa,
        "raw_sms":      sms_text[:300],
        "needs_review": confidence < 0.65,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────
class SMSIngestRequest(BaseModel):
    user_id: int
    sms_text: str

class FeedbackRequest(BaseModel):
    user_id: int
    transaction_id: int
    category: str
    sub_category: str = "General"
    is_reimbursement: bool = False


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    try:
        conn = get_conn()
        conn.close()
        return {"status": "ok", "service": "dekho-ml", "db": "postgresql", "connected": True}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.post("/api/sms/ingest")
def sms_ingest(req: SMSIngestRequest):
    """Parse an SMS, classify it, and save it to the main DB as a transaction."""
    result = classify_sms(req.sms_text)
    if "error" in result:
        raise HTTPException(422, result["detail"])

    # Determine review_status from confidence
    review_status = "needs_review" if result["needs_review"] else "auto_approved"

    # Save to transactions table (PostgreSQL)
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO transactions
                (user_id, date, merchant, amount, direction,
                 category, sub_category, payment_mode, vpa,
                 confidence, raw_sms, review_status, source_type,
                 is_income, is_refund, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'sms',
                    %s, %s, NOW(), NOW())
            RETURNING id
        """, (
            req.user_id,
            result["date"],
            result["merchant"],
            result["amount"],
            result["direction"],
            result["category"],
            result["sub_category"],
            result["payment_mode"],
            result.get("vpa"),
            result["confidence"],
            result.get("raw_sms"),
            review_status,
            result["direction"] == "credit",   # is_income (bool)
            result["category"] == "Refund",     # is_refund (bool)
        ))
        tx_id = cur.fetchone()[0]  # RETURNING id
        conn.commit()
        conn.close()
        result["id"] = tx_id
        logger.info(f"Saved SMS tx id={tx_id} user={req.user_id} \u20b9{result['amount']} \u2192 {result['category']}")
    except Exception as e:
        logger.error(f"DB save failed: {e}")
        result["id"] = None
        result["db_error"] = str(e)

    return result


@app.get("/api/insights/monthly-summary")
def monthly_summary(
    user_id: int = Query(...),
    year: int = Query(default=date.today().year),
    month: int = Query(default=date.today().month),
):
    month_str = f"{year}-{month:02d}"
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT direction, category, amount
            FROM transactions
            WHERE user_id = %s AND to_char(date::date, 'YYYY-MM') = %s
        """, (user_id, month_str))
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))

    income  = sum(r["amount"] for r in rows if r["direction"] == "credit")
    expense = sum(r["amount"] for r in rows if r["direction"] == "debit")
    savings = income - expense

    cat_totals: Dict[str, float] = {}
    for r in rows:
        if r["direction"] == "debit":
            cat_totals[r["category"]] = cat_totals.get(r["category"], 0) + r["amount"]

    return {
        "period": month_str,
        "income": round(income, 2),
        "expense": round(expense, 2),
        "savings": round(savings, 2),
        "savings_rate": round((savings / income * 100) if income > 0 else 0, 1),
        "top_categories": sorted(
            [{"category": k, "amount": round(v, 2)} for k, v in cat_totals.items()],
            key=lambda x: x["amount"], reverse=True
        )[:6],
        "transaction_count": len(rows),
    }


@app.get("/api/insights/recurring")
def recurring_transactions(user_id: int = Query(...)):
    """Detect recurring/subscription transactions based on merchant frequency."""
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT merchant, category, amount, date
            FROM transactions
            WHERE user_id = %s AND direction = 'debit'
            ORDER BY merchant, date
        """, (user_id,))
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))

    merchant_counts: Dict[str, List] = {}
    for r in rows:
        merchant_counts.setdefault(r["merchant"], []).append({"amount": r["amount"], "date": str(r["date"])})

    recurring = []
    for merchant, txns in merchant_counts.items():
        if len(txns) >= 2:
            amounts = [t["amount"] for t in txns]
            avg_amount = sum(amounts) / len(amounts)
            # Check if amounts are similar (within 10%)
            if max(amounts) - min(amounts) <= avg_amount * 0.10:
                recurring.append({
                    "merchant": merchant,
                    "frequency": len(txns),
                    "avg_amount": round(avg_amount, 2),
                    "last_seen": max(t["date"] for t in txns),
                    "likely_subscription": True,
                })

    return {"recurring": sorted(recurring, key=lambda x: x["avg_amount"], reverse=True)}


@app.get("/api/insights/top-merchants")
def top_merchants(user_id: int = Query(...), month: int = Query(default=date.today().month)):
    year = date.today().year
    month_str = f"{year}-{month:02d}"
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT merchant, SUM(amount) as total, COUNT(*) as txn_count
            FROM transactions
            WHERE user_id = %s AND direction = 'debit'
              AND to_char(date::date, 'YYYY-MM') = %s
            GROUP BY merchant
            ORDER BY total DESC
            LIMIT 8
        """, (user_id, month_str))
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))

    return {
        "period": month_str,
        "merchants": [
            {"merchant": r["merchant"], "total": round(r["total"], 2), "transactions": r["txn_count"]}
            for r in rows
        ],
    }


@app.get("/api/insights/festival-context")
def festival_context(user_id: int = Query(...)):
    """Return upcoming Indian festivals for spending awareness."""
    today = date.today()
    festivals = [
        {"name": "Diwali",      "date": "2025-10-20", "tip": "Plan gifts and shopping budget early"},
        {"name": "Holi",        "date": "2026-03-06", "tip": "Set aside a fun budget for celebrations"},
        {"name": "Eid",         "date": "2026-03-31", "tip": "Plan for family meals and gifts"},
        {"name": "Onam",        "date": "2026-08-24", "tip": "Traditional celebrations — budget for sadhya"},
        {"name": "Christmas",   "date": "2025-12-25", "tip": "Online shopping peaks — compare deals early"},
        {"name": "New Year",    "date": "2026-01-01", "tip": "Avoid impulse splurges on party spending"},
    ]
    upcoming = [
        f for f in festivals
        if date.fromisoformat(f["date"]) >= today
    ]
    upcoming.sort(key=lambda x: x["date"])
    return {"upcoming_festivals": upcoming[:3], "tip": "Plan ahead to avoid overspending during festive seasons."}


@app.get("/api/insights/cashback-savings")
def cashback_savings(user_id: int = Query(...)):
    """Simple cashback tracking placeholder."""
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT SUM(amount) as total FROM transactions
            WHERE user_id = %s AND direction = 'credit'
            AND (category = 'Refund' OR lower(merchant) LIKE '%cashback%' OR lower(merchant) LIKE '%refund%')
        """, (user_id,))
        row = cur.fetchone()
        conn.close()
        total = row["total"] or 0 if row else 0
    except Exception:
        total = 0
    return {"total_cashback_earned": round(total, 2), "currency": "INR"}


@app.post("/api/feedback/correct")
def feedback_correct(req: FeedbackRequest):
    """Update transaction category based on user correction."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE transactions
            SET category = %s, sub_category = %s, review_status = 'approved'
            WHERE id = %s AND user_id = %s
        """, (req.category, req.sub_category, req.transaction_id, req.user_id))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "updated", "transaction_id": req.transaction_id, "category": req.category}


@app.get("/api/review/queue")
def review_queue(user_id: int = Query(...), limit: int = Query(default=20)):
    """Transactions flagged for user review (low ML confidence)."""
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, date, merchant, amount, direction,
                   category, sub_category, payment_mode, vpa,
                   confidence, raw_sms, review_status
            FROM transactions
            WHERE user_id = %s AND review_status = 'needs_review'
            ORDER BY date DESC
            LIMIT %s
        """, (user_id, limit))
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))

    return [{**dict(r), 'date': str(r['date'])} for r in rows]


@app.get("/api/users/ml/pattern/{user_id}")
def spending_pattern(user_id: int):
    """Return ML-computed spending pattern for the user."""
    try:
        conn = get_conn()
        cur = conn.cursor(psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM transactions
            WHERE user_id = %s AND direction = 'debit'
            GROUP BY category
            ORDER BY total DESC
        """, (user_id,))
        rows = cur.fetchall()
        total_spend = sum(r["total"] for r in rows)
        conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))

    categories = [
        {
            "category": r["category"],
            "total": round(r["total"], 2),
            "count": r["count"],
            "pct": round(r["total"] / total_spend * 100, 1) if total_spend > 0 else 0,
        }
        for r in rows
    ]

    # Determine spending pattern label
    top = categories[0]["category"] if categories else None
    if top in ("Food & Dining", "Shopping"):
        pattern = "COMFORT_SPENDER"
    elif top in ("Investment", "Savings"):
        pattern = "SAVER"
    elif top in ("Transport", "Travel"):
        pattern = "MOBILE"
    else:
        pattern = "STABLE"

    return {
        "user_id": user_id,
        "spending_pattern": pattern,
        "emotional_trigger": "none",
        "top_category": top,
        "category_breakdown": categories,
        "total_spend_analysed": round(total_spend, 2),
    }

except Exception as e:
    print("FATAL ERROR IN ML_SERVICE MAIN.PY:", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    raise

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
