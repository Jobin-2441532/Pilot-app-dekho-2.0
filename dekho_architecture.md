# Dekho — Complete App Architecture Reference
### (PostgreSQL Migration Blueprint)

---

## 1. What Dekho Is

**Dekho** is an Indian personal finance companion — a mobile-first PWA (Progressive Web App) that:
- Ingests bank SMS messages, parses them with a custom ML pipeline, and auto-categorises transactions
- Shows a rich financial dashboard (spending heatmap, budget tracking, goals, assets)
- Has an AI chatbot ("Ask Dekho") powered by Gemini + FAISS RAG
- Learns from user corrections and retrains its categorisation model

---

## 2. System Architecture (Three Layers)

```
┌─────────────────────────────────────────────────────────┐
│               FRONTEND (React/Vite PWA)                 │
│  Port: 5173-5176   |   Auth: localStorage token         │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP REST
         ┌───────────▼───────────┐
         │   BACKEND (FastAPI)   │  Port 8000
         │   /api/*  -- Dekho    │
         │   /ml/*   -- FinanceAI│ (mounted sub-app)
         └───────────┬───────────┘
                     │ SQLAlchemy ORM / raw SQL
         ┌───────────▼──────────────────────┐
         │   DATABASES (currently SQLite)    │
         │   dekho.db   -- profile/goals/    │
         │               assets/budgets      │
         │   financeai.db -- transactions/   │
         │               ML models/mappings  │
         └───────────────────────────────────┘
```

> **The migration goal**: Replace both SQLite databases with **one PostgreSQL database** where every table is scoped per user via `user_id` foreign key.

---

## 3. Authentication — Current State & What Must Change

### Current (Prototype)

| Item | Current |
|------|---------|
| Auth endpoint | `POST /ml/api/users/login` & `/register` |
| Password | SHA-256 hash (stored in `users.hashed_password`) |
| Session | `localStorage.setItem('dekho_user_id', id)` |
| Auth guard | `RequireOnboarding` checks `localStorage.dekho_onboarded` |
| user_id usage | Hardcoded `user_id: 1` in many places (Budgets, Goals, Chat) |

### What Must Happen in PostgreSQL Design

- Every API call must carry a **JWT token** (not just a user_id)
- The backend must **validate the JWT and extract user_id** — never trust the client-sent `user_id`
- Every single table that stores user data must have `user_id REFERENCES users(id)`
- The frontend must send `Authorization: Bearer <token>` on every request

---

## 4. Complete Database Schema (All 16 Tables)

### 4.1 — `users` (Master Identity Table)

This table exists in **both** the current Dekho backend and the FinanceAI ML app but with different columns. They must be **merged into one unified users table** in PostgreSQL.

```sql
-- Merged from: backend/app/models/user.py + financeai/ml_app/models/user.py
users
  id                  SERIAL PRIMARY KEY
  email               VARCHAR(256) UNIQUE NOT NULL
  phone               VARCHAR(20) UNIQUE
  hashed_password     VARCHAR(256) NOT NULL
  is_active           BOOLEAN DEFAULT true
  name                VARCHAR(256)          -- from Dekho backend
  income_range        VARCHAR(64)           -- e.g. "50000-75000"
  goal_type           VARCHAR(256)          -- comma-separated goals
  risk_comfort        VARCHAR(64)
  monthly_budget      FLOAT
  financial_stage     VARCHAR(64)
  user_type           VARCHAR(32)           -- student/working/freelancer/business
  shopping_behavior   VARCHAR(32)           -- online/offline/mixed
  food_habit          VARCHAR(32)           -- cook/order/both
  created_at          TIMESTAMP DEFAULT now()
```

**Key rule**: Every other table has `user_id REFERENCES users(id) ON DELETE CASCADE`

---

### 4.2 — `transactions` (The Core ML Table)

This is the most complex table. Lives in `financeai/ml_app/models/transaction.py`.

```sql
transactions
  id                    SERIAL PRIMARY KEY
  user_id               INT REFERENCES users(id) ON DELETE CASCADE   -- ISOLATION KEY
  raw_sms               TEXT                   -- original SMS text
  bank                  VARCHAR(64)
  amount                FLOAT NOT NULL
  currency              VARCHAR(8) DEFAULT 'INR'
  tx_type               VARCHAR(8) NOT NULL    -- debit/credit
  tx_date               TIMESTAMP NOT NULL
  merchant              VARCHAR(256)
  vpa                   VARCHAR(256)           -- UPI VPA e.g. zomato@upi
  account_ref           VARCHAR(64)
  payment_method        VARCHAR(32)            -- UPI/CARD/ATM/NEFT/IMPS/WALLET
  category              VARCHAR(64)            -- ML-assigned category
  sub_category          VARCHAR(64)
  confidence            FLOAT                  -- ML confidence 0.0-1.0
  explanation           TEXT                   -- AI explanation of categorisation
  review_status         VARCHAR(32) DEFAULT 'pending'  -- pending/reviewed/auto_assigned
  is_recurring          BOOLEAN DEFAULT false
  is_split              BOOLEAN DEFAULT false
  is_refund             BOOLEAN DEFAULT false
  is_cashback           BOOLEAN DEFAULT false
  is_income             BOOLEAN DEFAULT false
  is_transfer           BOOLEAN DEFAULT false
  is_wallet_load        BOOLEAN DEFAULT false
  is_family_expense     BOOLEAN DEFAULT false
  is_deposit            BOOLEAN DEFAULT false
  is_mixed_basket       BOOLEAN DEFAULT false
  basket_splits         TEXT                   -- JSON: [{category, amount}]
  p2p_reviewed          BOOLEAN DEFAULT false
  p2p_context           VARCHAR(64)            -- food/travel/entertainment/gift/reimbursement
  subscription_type     VARCHAR(32)            -- personal/group
  subscription_members  INT
  net_amount            FLOAT                  -- amount after refund/cashback applied
  tags                  VARCHAR(512)           -- comma-separated: recurring,refund,p2p
  original_tx_id        INT REFERENCES transactions(id)  -- for refund linking
  cashback_linked_tx_id INT REFERENCES transactions(id)
  deposit_returned      BOOLEAN DEFAULT false
  location_lat          FLOAT
  location_lon          FLOAT
  location_label        VARCHAR(128)
  created_at            TIMESTAMP DEFAULT now()
  updated_at            TIMESTAMP DEFAULT now()
```

> **Critical**: Every query MUST include `WHERE user_id = :authenticated_user_id`

---

### 4.3 — `savings_goals`

Used in Budgets page AND by the AI chatbot (which can create goals via `[ACTION: ADD_GOAL]` tags).

```sql
savings_goals
  id              SERIAL PRIMARY KEY
  user_id         INT REFERENCES users(id) ON DELETE CASCADE
  name            VARCHAR(256) NOT NULL
  target_amount   FLOAT NOT NULL
  current_amount  FLOAT DEFAULT 0
  deadline        VARCHAR(32)        -- stored as string e.g. "2025-12-01"
  status          VARCHAR(32) DEFAULT 'active'
  created_at      TIMESTAMP DEFAULT now()
```

---

### 4.4 — `budgets`

Per-category monthly budget limits. Currently stored in `localStorage` — must be migrated to this table.

```sql
budgets
  id              SERIAL PRIMARY KEY
  user_id         INT REFERENCES users(id) ON DELETE CASCADE
  category        VARCHAR(64) NOT NULL    -- Essentials/Lifestyle/Future-oriented/Buffer
  monthly_limit   FLOAT NOT NULL
  month           VARCHAR(7) NOT NULL     -- e.g. "2026-04"
  created_at      TIMESTAMP DEFAULT now()
```

---

### 4.5 — `income_entries`

Manual income records (salary credits, freelance income etc.)

```sql
income_entries
  id          SERIAL PRIMARY KEY
  user_id     INT REFERENCES users(id) ON DELETE CASCADE
  date        VARCHAR(32) NOT NULL
  source      VARCHAR(128)
  amount      FLOAT NOT NULL
  notes       TEXT
  created_at  TIMESTAMP DEFAULT now()
```

---

### 4.6 — `assets`

Investments, savings accounts, liabilities. Currently hardcoded mock — must be dynamic.

```sql
assets
  id          SERIAL PRIMARY KEY
  user_id     INT REFERENCES users(id) ON DELETE CASCADE
  type        VARCHAR(64) NOT NULL    -- savings/investments/liabilities/retirement
  name        VARCHAR(256) NOT NULL
  value       FLOAT NOT NULL
  created_at  TIMESTAMP DEFAULT now()
```

---

### 4.7 — `merchant_mappings` (ML Learning Table)

When a user corrects a categorisation, this table is updated. Future SMS from the same merchant uses this mapping first (confidence_override = 1.0). **Strictly per-user** — User A's corrections never affect User B.

```sql
merchant_mappings
  id                  SERIAL PRIMARY KEY
  user_id             INT REFERENCES users(id) ON DELETE CASCADE
  merchant_key        VARCHAR(256) NOT NULL     -- lowercase normalised merchant name or VPA prefix
  category            VARCHAR(64) NOT NULL
  sub_category        VARCHAR(64) NOT NULL
  confidence_override FLOAT DEFAULT 1.0
  usage_count         INT DEFAULT 1
  created_at          TIMESTAMP DEFAULT now()
  updated_at          TIMESTAMP DEFAULT now()
  UNIQUE(user_id, merchant_key)                 -- one mapping per merchant per user
```

---

### 4.8 — `feedback_logs`

Every category correction is logged here. Once 5+ corrections accumulate, ML model retraining is triggered.

```sql
feedback_logs
  id                  SERIAL PRIMARY KEY
  user_id             INT REFERENCES users(id) ON DELETE CASCADE
  transaction_id      INT REFERENCES transactions(id) ON DELETE CASCADE
  original_category   VARCHAR(64) NOT NULL
  corrected_category  VARCHAR(64) NOT NULL
  original_confidence FLOAT
  created_at          TIMESTAMP DEFAULT now()
```

---

### 4.9 — `uploaded_files`

Tracks PDF/CSV bank statements uploaded by users.

```sql
uploaded_files
  id              SERIAL PRIMARY KEY
  user_id         INT REFERENCES users(id) ON DELETE CASCADE
  filename        VARCHAR(512) NOT NULL
  file_size       INT
  file_type       VARCHAR(32)     -- pdf/csv
  storage_path    VARCHAR(512)
  status          VARCHAR(32) DEFAULT 'uploaded'   -- uploaded/processing/completed/failed
  created_at      TIMESTAMP DEFAULT now()
```

---

### 4.10 — `raw_records`

Raw text before ML processing. Linked to an uploaded file.

```sql
raw_records
  id          SERIAL PRIMARY KEY
  file_id     INT REFERENCES uploaded_files(id)
  raw_text    TEXT NOT NULL
  source_type VARCHAR(32)    -- sms/pdf/csv
  created_at  TIMESTAMP DEFAULT now()
```

---

### 4.11 — `split_groups`

For tracking bill-splitting scenarios (group dinners, trips etc.)

```sql
split_groups
  id                  SERIAL PRIMARY KEY
  user_id             INT REFERENCES users(id) ON DELETE CASCADE
  anchor_tx_id        INT REFERENCES transactions(id)
  total_debit         FLOAT
  total_credited_back FLOAT DEFAULT 0.0
  net_expense         FLOAT
  status              VARCHAR(16) DEFAULT 'open'   -- open/partial/settled
  member_count        INT
  description         VARCHAR(256)
  created_at          TIMESTAMP DEFAULT now()
```

---

### 4.12 — `recurring_expenses`

Detected recurring patterns (subscriptions, EMIs, rent).

```sql
recurring_expenses
  id               SERIAL PRIMARY KEY
  user_id          INT REFERENCES users(id) ON DELETE CASCADE
  merchant         VARCHAR(256) NOT NULL
  category         VARCHAR(64) NOT NULL
  sub_category     VARCHAR(64)
  amount           FLOAT NOT NULL
  frequency        VARCHAR(32)    -- monthly/weekly/annual
  last_seen        TIMESTAMP
  next_expected    TIMESTAMP
  is_active        BOOLEAN DEFAULT true
  occurrence_count INT DEFAULT 1
  created_at       TIMESTAMP DEFAULT now()
```

---

### 4.13 — `wallet_floats`

Tracks money loaded into digital wallets (Paytm, PhonePe) to answer "where did wallet money go?"

```sql
wallet_floats
  id               SERIAL PRIMARY KEY
  user_id          INT REFERENCES users(id) ON DELETE CASCADE
  wallet_name      VARCHAR(64)    -- paytm/phonepe/amazon_pay
  loaded_amount    FLOAT
  spent_amount     FLOAT DEFAULT 0.0
  remaining_float  FLOAT
  load_tx_id       INT REFERENCES transactions(id)
  is_reconciled    BOOLEAN DEFAULT false
  created_at       TIMESTAMP DEFAULT now()
  updated_at       TIMESTAMP DEFAULT now()
```

---

### 4.14 — `social_contacts`

Stores known UPI VPAs so the app can detect P2P transfers with known people.

```sql
social_contacts
  id               SERIAL PRIMARY KEY
  user_id          INT REFERENCES users(id) ON DELETE CASCADE
  vpa              VARCHAR(256) NOT NULL
  display_name     VARCHAR(128)
  is_family        BOOLEAN DEFAULT false
  split_count      INT DEFAULT 0
  last_interaction TIMESTAMP DEFAULT now()
  created_at       TIMESTAMP DEFAULT now()
```

---

### 4.15 — `user_salary_profiles`

Tracks expected salary range to better classify large credit transactions.

```sql
user_salary_profiles
  id                    SERIAL PRIMARY KEY
  user_id               INT REFERENCES users(id) UNIQUE   -- one per user
  expected_amount_min   FLOAT
  expected_amount_max   FLOAT
  employer_vpa          VARCHAR(256)
  created_at            TIMESTAMP DEFAULT now()
  updated_at            TIMESTAMP DEFAULT now()
```

---

### 4.16 — `recommendations`

AI-generated financial recommendations shown on the Grow page.

```sql
recommendations
  id           SERIAL PRIMARY KEY
  user_id      INT REFERENCES users(id) ON DELETE CASCADE
  title        VARCHAR(512) NOT NULL
  description  TEXT NOT NULL
  cta          VARCHAR(128)
  tag          VARCHAR(64)    -- Save/Invest/Safety first
  created_at   TIMESTAMP DEFAULT now()
```

---

## 5. API Route Map

### 5.1 — Dekho Backend `/api/*`

| Method | Path | What it does | Data source |
|--------|------|--------------|-------------|
| GET | `/api/transactions` | List transactions | `financeai.db transactions` |
| GET | `/api/goals` | List savings goals | `dekho.db savings_goals` |
| POST | `/api/goals` | Create goal | `dekho.db savings_goals` |
| GET | `/api/profile` | Get user profile | `dekho.db users` |
| POST | `/api/profile/budget` | Update monthly budget | `dekho.db users.monthly_budget` |
| GET | `/api/summary` | Category spend totals | `financeai.db transactions` |
| GET | `/api/assets` | Asset list | Hardcoded mock |
| GET | `/api/opportunities` | Financial tips | Hardcoded mock |
| POST | `/api/chat` | AI chatbot | Gemini + FAISS RAG |

### 5.2 — FinanceAI ML App `/ml/api/*`

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/ml/api/users/register` | Register new user |
| POST | `/ml/api/users/login` | Login, returns user_id |
| GET | `/ml/api/users/{id}/profile` | User ML profile |
| POST | `/ml/api/sms/ingest` | Parse + classify single SMS |
| POST | `/ml/api/sms/bulk-ingest` | Classify list of SMS |
| GET | `/ml/api/transactions/` | List transactions (with filters) |
| GET | `/ml/api/transactions/{id}` | Get single transaction |
| DELETE | `/ml/api/transactions/{id}` | Delete transaction |
| POST | `/ml/api/transactions/p2p-review` | Label P2P context |
| POST | `/ml/api/transactions/basket-split` | Split mixed basket |
| POST | `/ml/api/transactions/family-tag` | Tag as family expense |
| POST | `/ml/api/transactions/subscription-review` | Label subscription type |
| GET | `/ml/api/transactions/payment-method-breakdown` | Payment method totals |
| POST | `/ml/api/feedback/correct` | Correct category, trains ML |
| GET | `/ml/api/feedback/stats` | Feedback stats |
| GET | `/ml/api/feedback/merchant-mappings` | All learned mappings |
| GET | `/ml/api/feedback/learning-stats` | ML improvement status |
| POST | `/ml/api/feedback/retrain-model` | Trigger ML retraining |
| GET | `/ml/api/insights/monthly-summary` | Income/expense/savings for month |
| GET | `/ml/api/insights/recurring` | Recurring expense detection |
| GET | `/ml/api/insights/top-merchants` | Top spending merchants |
| GET | `/ml/api/insights/cashback-savings` | Total cashbacks |
| GET | `/ml/api/insights/wallet-floats` | Unreconciled wallet loads |
| GET | `/ml/api/insights/festival-context` | Festival season detection |
| GET | `/ml/api/review/queue` | Pending review transactions |

---

## 6. Frontend Pages and Their API Calls

| Page | Route | API calls |
|------|-------|-----------|
| Login | `/login` | `POST /ml/api/users/login` or `/register` |
| Home | `/home` | `GET /api/profile`, `/api/transactions`, `/api/goals`, `/ml/api/insights/monthly-summary`, `POST /ml/api/sms/ingest` |
| Expenses | `/expenses` | `GET /ml/api/transactions`, `monthly-summary`, `payment-method-breakdown`, `review/queue`, `POST feedback/correct`, `DELETE transactions/{id}` |
| Budgets | `/budgets` | `GET /api/goals`, `/api/profile`, `/api/transactions`, `POST /api/profile/budget`, `/api/goals` |
| Assets | `/assets` | `GET /api/assets` (currently mock) |
| Grow | `/grow` | `GET /api/opportunities` (currently mock) |
| Review Queue | `/review` | `GET /ml/api/review/queue`, `POST feedback/correct` |
| Transactions | `/transactions` | `GET /ml/api/transactions` (full list) |
| Ask Dekho | `/ask` | `POST /api/chat` (Gemini RAG) |

---

## 7. User Isolation — Critical Issues to Fix

Every query must be scoped by `WHERE user_id = :authenticated_user_id`. Current failures:

| Problem | Location |
|---------|----------|
| `user_id: 1` hardcoded | `Budgets.tsx` goal creation, `dashboard.py` profile/budget update |
| `LIMIT 1` to get "the user" | `chat.py extract_global_context()`, `dashboard.py get_profile()` |
| Goals fetched without user filter | `GET /api/goals` has no WHERE clause |
| localStorage user_id trusted by API | All pages read `localStorage.getItem('dekho_user_id')` |
| Category budgets in localStorage | `Budgets.tsx` saves `dekho_budget_{category}` — must go to `budgets` table |

---

## 8. ML Pipeline — How SMS Becomes a Transaction

```
User pastes SMS
     ↓
POST /ml/api/sms/ingest  { user_id, sms_text }
     ↓
SMSParser.parse(sms_text)
  extracts: amount, tx_type, merchant, vpa, bank, date, payment_method
     ↓
LearningService.get_merchant_mappings(user_id)
  loads user's personal merchant_mappings from DB
     ↓
HybridClassifier.classify(parsed)
  checks merchant_mappings first (confidence_override = 1.0)
  falls back to ML model (TF-IDF + rule-based)
     ↓
ConfidenceEngine.score(...)
  boosts if known_merchant, location match
  reduces if P2P, mixed basket
     ↓
Special case detection:
  is_refund, is_cashback, is_wallet_load
  is_p2p_vpa → needs_p2p_review
  is_mixed_basket → needs basket split
  is_subscription → needs subscription review
  is_salary (large credit) → needs salary review
     ↓
Transaction saved to DB with review_status = PENDING or REVIEWED
     ↓
If is_refund → links back to original debit, reduces net_amount
If is_wallet_load → creates/updates WalletFloat record
```

---

## 9. AI Chatbot ("Ask Dekho") — How It Works

```
User sends message
     ↓
GET global_context from dekho.db:
  user name, monthly budget, goal_type
  SUM(transactions.amount) by category
  active savings goals with progress
     ↓
FAISS hybrid search on message:
  data_chunks (transaction summaries)
  knowledge_chunks (financial education articles)
     ↓
Gemini API called with:
  SYSTEM_PROMPT (persona: warm Indian finance friend)
  global_context (live DB state with exact numbers)
  data_context (FAISS transaction data)
  knowledge_context (FAISS articles)
  chat history
     ↓
Response parsed for action tags:
  [ACTION: ADD_GOAL | Title | Amount] → inserts into savings_goals
  [UI: PROGRESS | ...] → frontend renders progress bars
  [UI: CHART | ...] → frontend renders Recharts charts
     ↓
Sources returned to frontend for citation display
```

---

## 10. PostgreSQL Migration — Key Design Decisions

### Single Database, Single Connection Pool
Move from 2 SQLite files to 1 PostgreSQL database. Both the Dekho backend and the FinanceAI ML app must connect to the **same** PostgreSQL instance.

### JWT Authentication
```
Login → backend returns JWT { user_id, email, exp }
Frontend stores JWT in localStorage
Every request: Authorization: Bearer <token>
Backend: decode JWT → extract user_id → scope all queries
Never trust client-sent user_id parameter
```

### Async SQLAlchemy Throughout
The FinanceAI ML app already uses `AsyncSession`. The Dekho backend uses sync `SessionLocal` + raw `sqlite3.connect()`. Both must be unified to async SQLAlchemy with `asyncpg` driver.

### Environment Variables Required
```
DATABASE_URL=postgresql+asyncpg://dekho_user:password@localhost:5432/dekho_db
JWT_SECRET=your-256-bit-secret
JWT_EXPIRE_MINUTES=10080   # 7 days
GEMINI_API_KEY=...
```

---

## 11. What Is Currently Mock (Needs Real Data Post-Migration)

| Feature | Currently | PostgreSQL target |
|---------|-----------|-------------------|
| Assets list | Hardcoded 4 assets | `assets` table per user |
| Opportunities/Tips | Hardcoded 4 items | `recommendations` table |
| Monthly bar chart | Hardcoded heights `[20,35,30,50,45,100]` | Real monthly aggregates from `transactions` |
| "12% higher" badge | Hardcoded | Compare current vs prev month `transactions` |
| Committed spend | Partially hardcoded | Real from `transactions` filtered by category |
| Monthly income | Hardcoded `75000` in `dashboard.py` | Real from `income_entries` or credit `transactions` |
| Goal contribution amount | Hardcoded `5000/month` | Calculated from goal progress delta |

---

## 12. Summary — All 16 Tables for PostgreSQL

```
users                  ← merged from both user models
transactions           ← ML-processed transactions (the biggest table)
savings_goals          ← financial goals (created by user or AI chatbot)
budgets                ← per-category monthly limits (currently in localStorage!)
income_entries         ← manual income records
assets                 ← savings/investments/liabilities (currently mock)
merchant_mappings      ← ML learning: per-user merchant → category map
feedback_logs          ← correction history for ML retraining
uploaded_files         ← PDF/CSV upload tracking
raw_records            ← raw SMS/PDF text before parsing
split_groups           ← bill split tracking
recurring_expenses     ← detected subscription/EMI patterns
wallet_floats          ← digital wallet balance tracking
social_contacts        ← known UPI contacts
user_salary_profiles   ← salary detection parameters
recommendations        ← AI-generated financial tips (currently mock)
```

**Every table except `users` has `user_id FK -> users(id) ON DELETE CASCADE`.**
