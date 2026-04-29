"""
Security utilities for Dekho backend.
Covers:
  - File type / size validation
  - SMS text sanitisation
  - Sensitive data masking (account numbers, VPAs)
  - Feature contract enforcement for ML payloads
"""
from __future__ import annotations

import re
import os

# ---------------------------------------------------------------------------
# 1. File Upload Validation
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {".pdf", ".csv"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024   # 10 MB hard limit
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",  # Some browsers send this for CSV
}


def validate_upload(filename: str, content_type: str, size_bytes: int) -> None:
    """
    Raise ValueError if the uploaded file fails validation.
    Call this BEFORE writing the file to disk.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"File type '{ext}' is not allowed. Only PDF and CSV are supported."
        )
    if size_bytes > MAX_FILE_SIZE_BYTES:
        mb = size_bytes / (1024 * 1024)
        raise ValueError(
            f"File size {mb:.1f} MB exceeds the 10 MB limit."
        )
    # Content-type check (advisory — browsers can lie, but filter obvious mismatches)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        if not content_type.startswith("text/"):
            raise ValueError(
                f"Unexpected content type '{content_type}'. Upload a PDF or CSV file."
            )


# ---------------------------------------------------------------------------
# 2. SMS / Text Sanitisation
# ---------------------------------------------------------------------------

# Patterns to strip from raw SMS text before parsing
_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_URL_RE = re.compile(r"https?://\S+")

MAX_SMS_LENGTH = 2000   # Characters per SMS block


def sanitise_sms(raw: str) -> str:
    """
    Sanitise a raw SMS string before it is handed to the parser.
    - Strips HTML/script tags
    - Strips control characters
    - Truncates to MAX_SMS_LENGTH
    """
    text = _SCRIPT_RE.sub("", raw)
    text = _HTML_TAG_RE.sub("", text)
    text = _CONTROL_CHARS_RE.sub("", text)
    text = _URL_RE.sub("[URL]", text)          # Replace URLs with placeholder
    text = text.strip()
    if len(text) > MAX_SMS_LENGTH:
        text = text[:MAX_SMS_LENGTH]
    return text


# ---------------------------------------------------------------------------
# 3. Sensitive Data Masking
# ---------------------------------------------------------------------------

_ACCOUNT_RE = re.compile(r"\b(\d{4,})\b")   # Any 4+ digit sequence treated as account ref


def mask_account(value: str | None) -> str | None:
    """Mask all but last 4 digits of an account number string. e.g. '12345678' → 'XXXX5678'."""
    if not value:
        return value
    def _mask(m: re.Match) -> str:
        num = m.group(1)
        if len(num) > 4:
            return "X" * (len(num) - 4) + num[-4:]
        return num
    return _ACCOUNT_RE.sub(_mask, value)


def mask_vpa(vpa: str | None) -> str | None:
    """Partially mask a UPI VPA: e.g. 'johndoe@okaxis' → 'j*****e@okaxis'."""
    if not vpa or "@" not in vpa:
        return vpa
    handle, domain = vpa.split("@", 1)
    if len(handle) <= 2:
        return vpa
    masked_handle = handle[0] + "*" * (len(handle) - 2) + handle[-1]
    return f"{masked_handle}@{domain}"


def mask_transaction(tx: dict) -> dict:
    """
    Apply masking to a transaction dict before sending in API responses.
    Strips internal storage keys and masks account refs / VPAs.
    """
    safe = {k: v for k, v in tx.items() if k not in ("s3_key", "storage_path", "raw_sms")}
    if "account_ref" in safe:
        safe["account_ref"] = mask_account(safe["account_ref"])
    if "vpa" in safe:
        safe["vpa"] = mask_vpa(safe["vpa"])
    return safe


# ---------------------------------------------------------------------------
# 4. ML Feature Contract Enforcement
# ---------------------------------------------------------------------------

ML_REQUIRED_FIELDS = {"merchant", "amount", "direction", "category", "date"}
ML_ALLOWED_FIELDS = ML_REQUIRED_FIELDS | {
    "sub_category", "payment_mode", "is_recurring",
    "is_refund", "is_cashback", "is_income", "confidence",
}


def build_ml_payload(tx_dict: dict) -> dict:
    """
    Strip any raw/internal fields and return only the allowed feature contract
    fields for ML service consumption. Raises ValueError if required fields missing.
    """
    missing = ML_REQUIRED_FIELDS - set(tx_dict.keys())
    if missing:
        raise ValueError(f"ML payload missing required fields: {missing}")

    return {k: tx_dict[k] for k in ML_ALLOWED_FIELDS if k in tx_dict}
