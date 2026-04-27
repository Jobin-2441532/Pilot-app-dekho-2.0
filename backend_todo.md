# Dekho Backend — Architecture TODO List

> Based on `dekho_prototype_full.md` and analysis of the current backend state.

---

## Current State Summary

| Layer | Status |
|---|---|
| FastAPI + Uvicorn | ✅ Running |
| SQLite DB (basic schema) | ✅ Exists but incomplete |
| Transactions / Goals / Users APIs | ✅ Basic endpoints working |
| PostgreSQL | ✅ Running (via Docker) |
| MinIO (file storage) | ❌ Not set up |
| Redis + Celery | ❌ Not set up |
| File Upload (PDF/CSV) | ✅ Ingestion API implemented |
| SMS Paste & Parsing | ✅ Ingestion API implemented |
| Feature Layer | ❌ Not implemented |
| ML Models (Categorize, Behavior, Recommend) | ❌ Not connected |
| Authentication & Authorization | ❌ Not implemented |
| Audit Logging | ❌ Not implemented |

---

## Phase 1 — Data Ingestion

### 1.1 Upload API
- `[x]` Create `POST /upload` endpoint accepting `multipart/form-data`
- `[ ]` Store uploaded files in MinIO (or local folder for prototype)
- `[x]` Save file metadata to `uploaded_files` table in DB(filename, size, type, upload time, user_id)
- `[ ]` Return a file ID on successful upload

### 1.2 PDF Parsing
- `[x]` Implement a PDF parser using `pdfplumber` to extract transaction rows
- `[x]` Handle common Indian bank statement formats (HDFC, SBI, ICICI)
- `[x]` Extract: date, merchant/description, amount, debit/credit direction

### 1.3 CSV Parsing
- `[x]` Implement a CSV parser using `pandas`
- `[x]` Handle multiple column formats (UPI exports, bank statement CSVs)
- `[x]` Extract same fields as PDF parser

### 1.4 SMS Paste Input
- `[x]` Create `POST /sms/paste` endpoint to accept raw SMS text
- `[x]` Store raw SMS in `raw_sms_messages` table
- `[x]` Create `POST /sms/parse` endpoint to trigger parsing
- `[x]` Create `GET /sms/history` endpoint
- `[x]` Build SMS regex parser for common Indian bank SMS formats:
  - `[x]` Debit alerts: `debited by INR X at MERCHANT`
  - `[x]` Credit alerts: `credited with INR X`
  - `[x]` UPI: `UPI payment of INR X to MERCHANT`

### 1.5 Raw Records Storage
- `[x]` Store all parsed rows in `raw_records` table before normalization
- `[x]` Each raw record links back to its source file or SMS ID

---

## Phase 2 — Database Overhaul

### 2.1 Schema Migration (SQLite → PostgreSQL)
- `[x]` Install and configure PostgreSQL locally
- `[x]` Install `psycopg2` and `SQLAlchemy` (async) and add to `requirements.txt`
- `[x]` Install `Alembic` for migrations
- `[x]` Create `alembic.ini` and migration environment

### 2.2 Raw Data Layer Tables
- `[x]` Create `uploaded_files` table
- `[x]` Create `raw_records` table (links to uploaded file, stores unparsed row)
- `[ ]` Create `raw_sms_messages` table (stores raw SMS text with timestamp)

### 2.3 Canonical Finance Layer Tables
- `[/]` Expand `transactions` table with new columns:
  - `[x]` `direction` (credit/debit)
  - `[x]` `payment_mode`
  - `[x]` `source_type` (pdf, csv, sms)
  - `[x]` `source_reference_id`
  - `[ ]` `category_id` (FK to categories)
- `[ ]` Create `accounts` table (id, user_id, bank_name, account_type, balance)
- `[ ]` Create `categories` table (id, name, parent_category)
- `[x]` Create `assets` table (id, user_id, type, value) — replace hardcoded mock
- `[ ]` Create `sms_parsed_transactions` table (id, raw_sms_id, extracted fields, parse_confidence, mapped_transaction_id)

### 2.4 Feature Layer Tables
- `[ ]` Create `monthly_features` table (user_id, month, total_spend, category_ratio JSON, savings_rate, income_estimate)
- `[ ]` Create `weekly_features` table (user_id, week, spend JSON)
- `[ ]` Create `user_financial_profile` table (user_id, recurring_expenses JSON, spending_pattern JSON)

### 2.5 Output Layer Tables
- `[ ]` Create `model_predictions` table (user_id, model_name, output JSON, created_at)
- `[ ]` Create `insights` table (user_id, type, text, created_at)
- `[x]` Create `recommendations` table (user_id, title, description, cta, tag, created_at)
- `[ ]` Create `chat_context` table (user_id, session_id, context_snapshot JSON)

---

## Phase 3 — Data Normalization

- `[x]` Build a `NormalizationService` that converts raw parsed rows into canonical `transactions` records
- `[x]` Normalize merchant names (strip UPI IDs, standardize vendor names)
- `[x]` Map transaction direction from raw text (`debited` → debit, `credited` → credit)
- `[x]` Normalize timestamps to a standard UTC format
- `[x]` Auto-assign a default `category_id` during normalization (pre-ML fallback)
- `[ ]` Trigger normalization automatically after parsing (via Celery task or inline call)

---

## Phase 4 — Feature Layer

- `[x]` Create `FeatureService` class to compute and store reusable metrics
- `[x]` Implement `compute_monthly_features(user_id, month)`:
  - `[x]` Total spend
  - `[x]` Category distribution ratios
  - `[x]` Savings rate
  - `[x]` Income estimate
  - `[x]` Recurring expense list
- `[x]` Implement `compute_weekly_features(user_id, week)`
- `[x]` Implement `compute_user_profile(user_id)`:
  - `[x]` Spending patterns over time
  - `[x]` SMS-derived transaction patterns
- `[ ]` Schedule feature recomputation after every new batch of transactions
- `[x]` Expose `GET /features/monthly` and `GET /features/profile` endpoints

---

## Phase 5 — ML Model Integration

### 5.1 Auto-Categorization Model
- `[ ]` Build `POST /ml/categorize` endpoint
- `[ ]` Define feature contract: merchant_name, description, amount, timestamp, historical_category_patterns
- `[ ]` Implement rule-based categorization as baseline (keyword matching on merchant names)
- `[ ]` Add ML-based categorization (zero-shot or fine-tuned classifier) as upgrade path
- `[ ]` Store predicted category back into the `transactions` table
- `[ ]` Allow user override of predicted category

### 5.2 Behavior Model (Monthly Wrap)
- `[ ]` Build `POST /ml/behavior` endpoint
- `[ ]` Define feature contract: category_spend_distribution, weekly/monthly trends, recurring transactions, spending spikes
- `[ ]` Generate curated narrative insights from behavior analysis
- `[ ]` Structure outputs for storytelling-style Monthly Wrap UI visualization
- `[ ]` Each insight to include a reference/navigation link for drill-down pages

### 5.3 Opportunity / Recommendation Model
- `[ ]` Build `POST /ml/recommend` endpoint
- `[ ]` Define feature contract: income_estimate, savings_rate, expense_ratio, goal_progress, asset_data
- `[ ]` Generate: investment suggestions, savings recommendations
- `[ ]` Replace hardcoded `/opportunities` mock data with dynamic model outputs
- `[ ]` Store recommendations in `recommendations` table

### 5.4 Feature Access Pattern — Enforce "No Direct DB Access" Rule
- `[ ]` Refactor all ML endpoints to fetch data exclusively via `FeatureService`
- `[ ]` Never pass raw DB rows directly to ML models
- `[ ]` Validate model input payload against Pydantic schemas before inference

---

## Phase 6 — Background Job Infrastructure

- `[ ]` Install `Celery` and `Redis`, add to `requirements.txt`
- `[ ]` Create `celery_app.py` with broker configuration
- `[ ]` Move parsing tasks to Celery background jobs:
  - `[ ]` PDF/CSV parsing task
  - `[ ]` SMS parsing task
  - `[ ]` Feature recomputation task
  - `[ ]` ML inference task
- `[ ]` Add job status tracking (PENDING, RUNNING, DONE, FAILED)
- `[ ]` Expose `GET /jobs/{job_id}/status` endpoint for frontend polling

---

## Phase 7 — File Storage (MinIO)

- `[ ]` Install and run MinIO locally (Docker or binary)
- `[ ]` Install `boto3` or `minio` Python SDK, add to `requirements.txt`
- `[ ]` Create `FileStorageService` to handle upload/download/delete
- `[ ]` Store all uploaded PDFs/CSVs in MinIO, not the filesystem
- `[ ]` Never expose raw file URLs publicly — generate signed URLs with expiry
- `[ ]` Design storage path: `user_{id}/uploads/{file_id}.pdf`

---

## Phase 8 — Chatbot Integration

- `[ ]` Refactor `chat.py` to pull data from `chat_context` table (not isolated mock)
- `[ ]` Build `ChatContextService`:
  - `[ ]` Pull user's financial profile from feature layer
  - `[ ]` Attach recent insights and recommendations
  - `[ ]` Include recent transaction summary
- `[ ]` Pass enriched context to Gemini/Ollama in the system prompt
- `[ ]` Ensure chatbot only accesses the requesting user's data
- `[ ]` Store each chat session's context snapshot in `chat_context` table

---

## Phase 9 — API Layer Completion

- `[ ]` Review all existing endpoints for hardcoded mock data and replace with DB queries:
  - `[ ]` `/assets` — currently fully hardcoded
  - `[ ]` `/opportunities` — currently fully hardcoded
  - `[ ]` `/profile` — `monthlyIncome` is hardcoded to 75000
- `[ ]` Add missing endpoints per architecture spec:
  - `[ ]` `GET /files` — list uploaded files for a user
  - `[ ]` `GET /transactions/summary` — period-based aggregate
  - `[ ]` `GET /features/monthly`
  - `[ ]` `GET /features/profile`
  - `[ ]` `POST /ml/categorize`
  - `[ ]` `POST /ml/behavior`
  - `[ ]` `POST /ml/recommend`
  - `[ ]` `POST /sms/paste`
  - `[ ]` `GET /sms/history`
  - `[ ]` `POST /sms/parse`
- `[ ]` Add pagination to `GET /transactions`
- `[ ]` Add date range filtering to `GET /transactions`

---

## Phase 10 — Authentication & Authorization

- `[ ]` Install `python-jose` and `passlib`, add to `requirements.txt`
- `[ ]` Implement JWT-based auth:
  - `[ ]` `POST /auth/register`
  - `[ ]` `POST /auth/login` — returns access token
  - `[ ]` `POST /auth/refresh`
- `[ ]` Create `get_current_user` dependency for protected routes
- `[ ]` Enforce `user_id` filtering on ALL data endpoints (no cross-user data leaks)
- `[ ]` Hash passwords with bcrypt before storing

---

## Phase 11 — Security Hardening

- `[ ]` Add input validation for all upload endpoints (file type, size limit)
- `[ ]` Sanitize SMS text before parsing (strip scripts, special chars)
- `[ ]` Mask sensitive identifiers in API responses (e.g., account numbers → `XXXX1234`)
- `[ ]` Rate-limit upload and parsing endpoints (e.g., 5 uploads/minute per user)
- `[ ]` Add CORS policy — restrict to frontend origin only
- `[ ]` Never return raw file paths or MinIO bucket info in API responses
- `[ ]` Pass only minimal required fields to ML services (enforce feature contracts)

---

## Phase 12 — Audit & Monitoring

- `[ ]` Create structured logging with `structlog` or Python `logging`
- `[ ]` Log upload events (user_id, file_id, timestamp, status)
- `[ ]` Log parsing success/failure (file_id, rows extracted, errors)
- `[ ]` Log ML model execution (model_name, input_size, latency, output_preview)
- `[ ]` Log access to sensitive endpoints (chat, transactions, profile)
- `[ ]` Add a `GET /health` endpoint for backend status

---

## Phase 13 — Frontend Integration

- `[ ]` Replace all frontend mock/dummy data with real API calls via React Query:
  - `[ ]` Transactions list and summary
  - `[ ]` Goals
  - `[ ]` Assets (Savings, Investments, Liabilities)
  - `[ ]` Opportunities / Recommendations
  - `[ ]` Profile data
- `[ ]` Add **SMS Paste UI** to the upload/onboarding screen:
  - `[ ]` Textarea to paste one or multiple SMS lines
  - `[ ]` Submit button triggers `POST /sms/paste` + `POST /sms/parse`
  - `[ ]` Show parsing result feedback (merchant, amount detected)
- `[ ]` Show upload progress indicator for PDF/CSV uploads
- `[ ]` Poll job status via `GET /jobs/{id}/status` for async tasks
- `[ ]` Handle auth token storage and refresh in the frontend

---

## Quick Wins (Do First)

- `[x]` Replace hardcoded `/assets` mock data with a real DB-backed table + endpoint
- `[x]` Replace hardcoded `/opportunities` with DB-backed `recommendations` table
- `[x]` Fix hardcoded `monthlyIncome: 75000` in `/profile` to use actual income data
- `[x]` Add `direction` (credit/debit) column to `transactions` table
- `[x]` Add `source_type` column to `transactions` to track PDF/CSV/SMS origin
