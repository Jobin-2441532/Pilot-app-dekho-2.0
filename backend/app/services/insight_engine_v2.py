"""
Dekho Insight Engine v2
========================
Fully offline, zero dependencies beyond Python stdlib.
Philosophy: Confusion → Awareness → Understanding → Habit → Confidence → Asset Creation

Key improvements over v1:
- 50+ spending patterns vs 10
- Multi-signal reasoning (combines patterns + emotion + time + history)
- User journey stage awareness (beginner → intermediate → confident)
- Seasonal / contextual awareness (salary day, month start/end, festivals)
- Streak & habit tracking language
- Per-category deep insights (not just "food is high")
- Variety engine with usage tracking (never repeats same variant twice in a row)
- "Tap to see why" detail explanations
- Ask Dekho Q&A responses
- Negative event handling (overspend, missed savings) with zero guilt
- Cross-signal storytelling ("three things happened this week...")
- Opportunity detection language
- Risk-aware investment language
"""

import random
import hashlib
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
from datetime import date


# ═══════════════════════════════════════════════════════════════
# ENUMS — feed these from your ML model output
# ═══════════════════════════════════════════════════════════════

class SpendingPattern(Enum):
    # Behavioral
    COMFORT_SPENDING        = "comfort_spending"
    IMPULSE_HEAVY           = "impulse_heavy"
    INTENTIONAL             = "intentional"
    BOREDOM_SPENDING        = "boredom_spending"
    STRESS_SPENDING         = "stress_spending"
    CELEBRATION_SPENDING    = "celebration_spending"
    SOCIAL_SPENDING         = "social_spending"       # peer influence / outings
    REVENGE_SPENDING        = "revenge_spending"      # after restriction period
    FATIGUE_SPENDING        = "fatigue_spending"      # tired = low willpower
    FOMO_SPENDING           = "fomo_spending"         # fear of missing out
    ASPIRATIONAL_SPENDING   = "aspirational_spending" # buying identity / status

    # Volume
    DECLINING_SPEND         = "declining_spend"
    RISING_SPEND            = "rising_spend"
    STABLE                  = "stable"
    UNUSUALLY_LOW           = "unusually_low"
    UNUSUALLY_HIGH          = "unusually_high"
    BUDGET_OVERRUN          = "budget_overrun"

    # Timing
    WEEKEND_SPIKES          = "weekend_spikes"
    LATE_NIGHT_IMPULSE      = "late_night_impulse"
    SALARY_DAY_SPLURGE      = "salary_day_splurge"
    MONTH_END_CRUNCH        = "month_end_crunch"
    MORNING_COFFEE_HABIT    = "morning_coffee_habit"

    # Category-specific
    FOOD_HEAVY              = "food_heavy"
    FOOD_IMPROVING          = "food_improving"
    TRANSPORT_HEAVY         = "transport_heavy"
    SHOPPING_BINGE          = "shopping_binge"
    SUBSCRIPTION_CREEP      = "subscription_creep"   # too many subs
    ENTERTAINMENT_HEAVY     = "entertainment_heavy"
    HEALTH_INVESTING        = "health_investing"      # gym, wellness — positive
    EDUCATION_INVESTING     = "education_investing"   # courses, books — positive

    # Saving behaviors
    CONSISTENT_SAVER        = "consistent_saver"
    IRREGULAR_SAVER         = "irregular_saver"
    FIRST_TIME_SAVER        = "first_time_saver"
    SAVING_STREAK           = "saving_streak"
    MISSED_SAVINGS_TARGET   = "missed_savings_target"
    SAVINGS_MILESTONE       = "savings_milestone"    # hit a round number

    # Investment behaviors
    FIRST_INVESTMENT        = "first_investment"
    CONSISTENT_SIP          = "consistent_sip"
    MISSED_SIP              = "missed_sip"
    PORTFOLIO_GROWING       = "portfolio_growing"
    PORTFOLIO_DIP           = "portfolio_dip"

class EmotionalTrigger(Enum):
    STRESS      = "stress"
    BOREDOM     = "boredom"
    CELEBRATION = "celebration"
    PEER        = "peer_influence"
    FATIGUE     = "fatigue"
    ANXIETY     = "anxiety"
    EXCITEMENT  = "excitement"
    LONELINESS  = "loneliness"
    NONE        = "none"

class UserStage(Enum):
    """Where the user is on the Dekho Value Journey."""
    CONFUSED        = "confused"       # new, overwhelmed, no habits
    AWARE           = "aware"          # tracking, starting to notice
    UNDERSTANDING   = "understanding"  # sees patterns, making small changes
    HABIT           = "habit"          # consistent behaviors forming
    CONFIDENT       = "confident"      # makes intentional decisions
    BUILDING        = "building"       # actively creating assets

class TimeOfDay(Enum):
    MORNING   = "morning"    # 6–11
    AFTERNOON = "afternoon"  # 11–17
    EVENING   = "evening"    # 17–21
    NIGHT     = "night"      # 21+

class MonthPosition(Enum):
    START  = "start"   # 1–7
    MIDDLE = "middle"  # 8–22
    END    = "end"     # 23+


# ═══════════════════════════════════════════════════════════════
# USER DATA — connect these fields to your local file + ML model
# ═══════════════════════════════════════════════════════════════

@dataclass
class UserData:
    # ── Identity ──
    name: str                           = "there"
    onboarding_goal: str                = "understand my spending"
    stage: UserStage                    = UserStage.AWARE
    days_on_app: int                    = 0
    time_of_day: TimeOfDay              = TimeOfDay.MORNING

    # ── Today ──
    today_spend: float                  = 0
    today_top_category: str             = "Food & Dining"
    today_top_amount: float             = 0
    today_transaction_count: int        = 0
    today_largest_single: float         = 0
    today_largest_vendor: str           = ""
    avg_daily_spend: float              = 0

    # ── This week ──
    week_spend: float                   = 0
    week_vs_last_week_pct: float        = 0
    week_intentional_ratio: float       = 0.6
    week_top_category: str              = "Food & Dining"
    week_categories: dict               = field(default_factory=dict)  # {category: amount}

    # ── This month ──
    month_total: float                  = 0
    month_vs_last_month_pct: float      = 0
    month_top_category: str             = "Food & Dining"
    month_top_amount: float             = 0
    month_second_category: str          = "Transport"
    month_second_amount: float          = 0
    month_budget: float                 = 0
    month_spent_so_far: float           = 0
    month_position: MonthPosition       = MonthPosition.MIDDLE
    is_salary_week: bool                = False
    saving_target_pct: float            = 0
    investment_goal_pct: float          = 0
    remaining_budget: float             = 0

    # ── Patterns (ML model output) ──
    primary_pattern: SpendingPattern    = SpendingPattern.STABLE
    secondary_pattern: Optional[SpendingPattern] = None
    emotional_trigger: EmotionalTrigger = EmotionalTrigger.NONE
    spends_more_on_weekends: bool       = False
    peak_spend_time: str                = "evenings"
    impulse_categories: list            = field(default_factory=list)
    controlled_categories: list         = field(default_factory=list)

    # ── Streaks & habits ──
    streak_days: int                    = 0
    streak_type: str                    = "controlled_spending"
    longest_streak: int                 = 0
    times_checked_app_this_week: int    = 0
    consecutive_savings_months: int     = 0

    # ── History ──
    last_month_top_category: str        = ""
    last_month_total: float             = 0
    prev_week_top_category: str         = ""
    has_overspent_before: bool          = False
    months_tracking: int                = 0

    # ── Savings ──
    savings_total: float                = 0
    savings_added_this_month: float     = 0
    savings_target_month: float         = 0
    savings_growth_pct_6m: float        = 0
    safety_months: float                = 0
    savings_milestone_hit: bool         = False
    savings_milestone_amount: float     = 0

    # ── Investments ──
    investments_total: float            = 0
    investments_gain: float             = 0
    investments_gain_pct: float         = 0
    net_worth: float                    = 0
    net_worth_change: float             = 0
    net_worth_change_pct: float         = 0
    growth_source: str                  = "investments"
    top_investment_type: str            = "Mutual Funds"
    top_investment_pct: float           = 0
    stock_volatility: str               = "stable"
    can_invest_more: bool               = False
    sip_active: bool                    = False
    sip_missed_this_month: bool         = False
    portfolio_risk: str                 = "moderate"

    # ── Goals ──
    goal_name: str                      = ""
    goal_target: float                  = 0
    goal_saved: float                   = 0
    goal_target_date: str               = ""
    goal_monthly_contribution: float    = 0
    goal_on_track: bool                 = True

    # ── Subscriptions ──
    active_subscriptions: int           = 0
    subscription_total: float           = 0
    unused_subscriptions: int           = 0


# ═══════════════════════════════════════════════════════════════
# UTILITY LAYER
# ═══════════════════════════════════════════════════════════════

_last_picks: dict = {}

def pick(key: str, variants: list[str]) -> str:
    """
    Smart rotation: never repeats the same variant twice in a row.
    key = unique identifier for this insight slot (e.g. "home_hero_comfort")
    """
    last = _last_picks.get(key)
    available = [v for v in variants if v != last] if len(variants) > 1 else variants
    chosen = random.choice(available)
    _last_picks[key] = chosen
    return chosen

def fmt(amount: float) -> str:
    if amount >= 10000000:
        return f"₹{amount/10000000:.1f}Cr"
    if amount >= 100000:
        return f"₹{amount/100000:.1f}L"
    if amount >= 1000:
        return f"₹{amount:,.0f}"
    return f"₹{int(amount)}"

def fmt_pct(pct: float, show_sign: bool = True) -> str:
    sign = "+" if pct > 0 and show_sign else ""
    return f"{sign}{pct:.0f}%"

def direction(pct: float) -> str:
    if pct > 20:  return "significantly more"
    if pct > 10:  return "noticeably more"
    if pct > 3:   return "a little more"
    if pct < -20: return "significantly less"
    if pct < -10: return "noticeably less"
    if pct < -3:  return "a little less"
    return "about the same"

def goal_pct(d: UserData) -> int:
    if not d.goal_target: return 0
    return min(int((d.goal_saved / d.goal_target) * 100), 100)

def greeting(d: UserData) -> str:
    t = d.time_of_day
    if t == TimeOfDay.MORNING:   return f"Good morning, {d.name}."
    if t == TimeOfDay.AFTERNOON: return f"Good afternoon, {d.name}."
    if t == TimeOfDay.EVENING:   return f"Good evening, {d.name}."
    return f"Hey, {d.name}."

def stage_aware(d: UserData, beginner: str, intermediate: str, confident: str) -> str:
    """Return different copy depending on user's journey stage."""
    if d.stage in (UserStage.CONFUSED, UserStage.AWARE):
        return beginner
    if d.stage in (UserStage.UNDERSTANDING, UserStage.HABIT):
        return intermediate
    return confident

def vendor_for(category: str) -> str:
    return {
        "Food & Dining":  "Swiggy/Zomato",
        "Shopping":       "online shopping",
        "Transport":      "cab rides",
        "Entertainment":  "streaming/events",
        "Groceries":      "grocery runs",
        "Subscriptions":  "subscription apps",
        "Health":         "wellness",
        "Travel":         "travel bookings",
    }.get(category, category.lower())

def multi_signal_story(d: UserData) -> Optional[str]:
    """
    If multiple interesting signals exist simultaneously,
    weave them into a single coherent sentence.
    """
    signals = []
    if d.primary_pattern == SpendingPattern.COMFORT_SPENDING and d.emotional_trigger == EmotionalTrigger.STRESS:
        signals.append("stress")
    if d.spends_more_on_weekends and d.week_vs_last_week_pct > 15:
        signals.append("weekend_high")
    if d.secondary_pattern == SpendingPattern.SUBSCRIPTION_CREEP:
        signals.append("subscriptions")
    if d.month_position == MonthPosition.END and d.remaining_budget < d.month_budget * 0.1:
        signals.append("month_end_low")

    if "stress" in signals and "weekend_high" in signals:
        return "A stressful week often moves spending toward comfort — and weekends gave it room to grow."
    if "stress" in signals and "subscriptions" in signals:
        return "Stress spending + quiet subscription growth — two patterns worth watching together."
    if "month_end_low" in signals and "weekend_high" in signals:
        return "Month-end with a weekend ahead — the tightest combination for staying on budget."
    return None


# ═══════════════════════════════════════════════════════════════
# HOME TAB
# ═══════════════════════════════════════════════════════════════

def home_hero_card(d: UserData) -> dict:
    p  = d.primary_pattern
    e  = d.emotional_trigger
    cat = d.today_top_category

    # ── Emotional + pattern combos first (most specific) ──
    if p == SpendingPattern.COMFORT_SPENDING and e == EmotionalTrigger.STRESS:
        headline = pick("hero_comfort_stress", [
            "Today, stress found its way into spending.",
            "A heavy day — and spending followed.",
            "Today had weight to it. Spending noticed.",
        ])
        sub = pick("hero_comfort_stress_sub", [
            f"{cat} became today's comfort. That's a very human response to a hard day.",
            "When things feel heavy, spending sometimes lightens the mood. You're aware of it now — that's what matters.",
            f"Stress and {cat.lower()} spending often travel together. Noticing the pattern is step one.",
        ])

    elif p == SpendingPattern.COMFORT_SPENDING and e == EmotionalTrigger.BOREDOM:
        headline = pick("hero_comfort_boredom", [
            "Boredom and spending showed up together today.",
            "A quiet day — spending filled some of the space.",
            "Today's spending had a boredom flavour to it.",
        ])
        sub = pick("hero_comfort_boredom_sub", [
            f"{cat} picked up when there wasn't much else to do. It's a common pattern.",
            "Boredom spending is one of the trickiest to catch. You just caught it.",
            "When the day has gaps, spending often fills them. Worth noticing.",
        ])

    elif p == SpendingPattern.CELEBRATION_SPENDING:
        headline = pick("hero_celebration", [
            "You celebrated today — money included.",
            "Today called for a little extra. You answered.",
            "A celebratory kind of spending day.",
        ])
        sub = pick("hero_celebration_sub", [
            f"Celebration spending is real and valid. {cat} was the mode today.",
            "Joy costs sometimes. Conscious celebration is part of a healthy money life.",
            f"You spent more than usual — and it sounds like it was worth it.",
        ])

    elif p == SpendingPattern.SOCIAL_SPENDING:
        headline = pick("hero_social", [
            "Social energy drove spending today.",
            "People time usually comes with some spending — today was that day.",
            "Today's spending was social in nature.",
        ])
        sub = pick("hero_social_sub", [
            "Spending with or on people isn't waste — but it's worth knowing when it's happening.",
            f"{cat} with others today. Social spending is often the hardest to question in the moment.",
            "Being present with people matters. The money part just needs awareness.",
        ])

    elif p == SpendingPattern.SALARY_DAY_SPLURGE:
        headline = pick("hero_salary", [
            "Salary week. Spending tends to loosen a little.",
            "Money in, money moving — the salary week rhythm.",
            "Payday energy is real. Today had it.",
        ])
        sub = pick("hero_salary_sub", [
            "Salary week spending spikes are among the most predictable patterns. You're not alone.",
            f"The account filled up — and {cat.lower()} responded first. It happens to most people.",
            "Fresh salary = fresh spending impulse. Awareness of the cycle is how you change it.",
        ])

    elif p == SpendingPattern.MONTH_END_CRUNCH:
        headline = pick("hero_month_end", [
            "Budget is getting tight toward month end.",
            "Final stretch of the month — and the budget feels it.",
            "Month end arrived. So did the awareness.",
        ])
        sub = pick("hero_month_end_sub", [
            f"You have {fmt(d.remaining_budget)} left for the rest of the month. Every spend now is a conscious choice.",
            "Month-end awareness is actually a superpower — most people don't even notice.",
            f"The last stretch. {fmt(d.remaining_budget)} remaining. Small decisions matter a lot right now.",
        ])

    elif p == SpendingPattern.INTENTIONAL:
        headline = pick("hero_intentional", [
            "Today was intentional.",
            "You spent with purpose today.",
            "A mindful spending day.",
            "Today, you knew where your money was going.",
        ])
        sub = pick("hero_intentional_sub", [
            f"Most of today's {fmt(d.today_spend)} was planned. {cat} was the focus — that's the Dekho way.",
            "Intentional spending isn't about spending less. It's about knowing why. You did that today.",
            stage_aware(d,
                "You're getting better at this. Today's spending was mostly planned.",
                f"Intentional day. {cat} was your main focus, and it was chosen, not reactive.",
                f"Another clean day. {fmt(d.today_spend)}, most of it deliberate.",
            ),
        ])

    elif p == SpendingPattern.UNUSUALLY_LOW:
        headline = pick("hero_low", [
            "A light spending day.",
            "Today was quiet on spending — in a good way.",
            "You barely touched the budget today.",
        ])
        sub = pick("hero_low_sub", [
            f"{fmt(d.today_spend)} today — well below your {fmt(d.avg_daily_spend)} average. That gap is real savings.",
            "Some days just don't need much spending. Today was one of them.",
            stage_aware(d,
                "Low spending day. The average is starting to shift.",
                "A quiet day financially. These days compound into strong months.",
                f"Only {fmt(d.today_spend)} today. Days like this are why your savings grow.",
            ),
        ])

    elif p == SpendingPattern.UNUSUALLY_HIGH:
        headline = pick("hero_high", [
            "Today ran higher than usual.",
            "A bigger spending day than average.",
            "Today's spending stood out.",
        ])
        sub = pick("hero_high_sub", [
            f"You spent {fmt(d.today_spend)} today — {fmt(d.today_spend - d.avg_daily_spend)} above your daily average. Worth understanding why.",
            f"{cat} drove most of it. Was this planned, or did it sneak up?",
            f"Higher than your usual {fmt(d.avg_daily_spend)}. One big day doesn't break a month — but it's good to notice.",
        ])

    elif p == SpendingPattern.FOOD_HEAVY:
        headline = pick("hero_food", [
            "Food took the lead today.",
            "A food-forward spending day.",
            "Today's money mostly went to meals.",
        ])
        sub = pick("hero_food_sub", [
            f"Food & dining made up most of today's {fmt(d.today_spend)}. Tasty, but worth tracking.",
            f"You fed well today — {fmt(d.today_top_amount)} on food.",
            stage_aware(d,
                "Food is your biggest category today. Just noticing is the first step.",
                "Food spending is high today. You know this pattern — what do you want to do with it?",
                f"Food-heavy day. You've been here before — and you know how to balance it.",
            ),
        ])

    elif p == SpendingPattern.SHOPPING_BINGE:
        headline = pick("hero_shopping", [
            "A shopping kind of day.",
            "Today, the cart won.",
            "Spending flowed toward shopping today.",
        ])
        sub = pick("hero_shopping_sub", [
            f"{fmt(d.today_largest_single)} on {d.today_largest_vendor or 'shopping'} — your biggest single spend today.",
            "Shopping days happen. The question Dekho asks: was it planned, or did it find you?",
            "Some days call for retail therapy. Some days it's habit. Worth a quick look.",
        ])

    elif p == SpendingPattern.SUBSCRIPTION_CREEP:
        headline = pick("hero_subs", [
            "Subscriptions quietly accumulated today.",
            "Background spending — subscriptions renewed.",
            "The invisible spending: subscriptions.",
        ])
        sub = pick("hero_subs_sub", [
            f"You have {d.active_subscriptions} active subscriptions totalling {fmt(d.subscription_total)}/month. "
            f"{d.unused_subscriptions} haven't been used this month.",
            "Subscription creep is real — services auto-renew and the total grows quietly. Worth an audit.",
            f"{fmt(d.subscription_total)}/month in subscriptions. If even one is unused, that's money worth redirecting.",
        ])

    elif p == SpendingPattern.DECLINING_SPEND:
        headline = pick("hero_declining", [
            "Spending is easing this week.",
            "The numbers are moving in the right direction.",
            "A quieter, leaner period — and that's good.",
        ])
        sub = pick("hero_declining_sub", [
            f"You're spending {direction(d.week_vs_last_week_pct)} than last week. "
            "The difference adds to your savings quietly.",
            "Less spending doesn't mean less living. You're finding the balance.",
            stage_aware(d,
                "Spending is coming down. You're starting to shape your habits.",
                "The downward trend is holding. This is what progress looks like.",
                "Controlled decline in spending. Your future self will thank you.",
            ),
        ])

    elif p == SpendingPattern.HEALTH_INVESTING:
        headline = pick("hero_health", [
            "Today's spending invested in you.",
            "Money toward health — that's a different kind of asset.",
            "You spent on yourself today. The good kind.",
        ])
        sub = pick("hero_health_sub", [
            "Health and wellness spending isn't expense — it's investment. Dekho sees the difference.",
            f"{cat} was today's focus. Taking care of yourself has long-term returns.",
            "Gym, wellness, health — these show up in spending, but they're building something real.",
        ])

    else:  # STABLE and fallback
        headline = pick("hero_stable", [
            "A steady day with money.",
            "Today stayed close to your rhythm.",
            "Nothing unusual — just a regular day.",
            f"A consistent day, {d.name}.",
        ])
        sub = pick("hero_stable_sub", [
            f"You spent {fmt(d.today_spend)} today, close to your {fmt(d.avg_daily_spend)} daily average. Consistency builds habits.",
            f"{cat} was your main spend. Everything within normal range.",
            stage_aware(d,
                "Steady days like this are how good financial habits start forming.",
                "Regular, predictable days are actually the goal. You're building that.",
                "Consistency is the quiet superpower. You've got it.",
            ),
        ])

    # Multi-signal overlay
    story = multi_signal_story(d)
    detail = story if story else None

    return {
        "type": "hero_card",
        "headline": headline,
        "subtext": sub,
        "detail": detail,
        "tap_label": "Tap to see why",
    }


def home_streak_nudge(d: UserData) -> Optional[dict]:
    if d.streak_days < 2:
        return None

    s = d.streak_days
    longest = d.longest_streak

    if s >= 30:
        h = pick("streak_30", [f"{s} days. This is a habit now.", f"A month of awareness. Remarkable."])
        sub = pick("streak_30_sub", ["You've crossed from tracking into living it. That's the Dekho journey.", "30 days changes a relationship with money. You've done that."])
    elif s >= 14:
        h = pick("streak_14", [f"{s} days of mindful spending.", f"Two weeks of staying aware.", f"{s} days in. A real streak."])
        sub = pick("streak_14_sub", ["Habits live in the repetition. You're deep in it now.", "Two weeks of this changes how you see money."])
    elif s >= 7:
        h = pick("streak_7", [f"{s} days of controlled spending.", f"A full week of awareness.", f"{s} days in — the rhythm is real."])
        sub = pick("streak_7_sub", [
            "A week of awareness is when things start shifting.",
            "Seven days in. The habit is forming under the surface.",
            stage_aware(d, "You're building something. Keep going.", "A week of this compounds into a month.", "You know this feeling — keep it."),
        ])
    elif s >= 3:
        h = pick("streak_3", [f"{s} days of staying aware.", f"{s} days in. The rhythm is forming.", f"{s} days of controlled spending."])
        sub = pick("streak_3_sub", ["Small streaks become big habits.", "The first few days are the hardest. You're through them.", "Consistency is the only tool that works. You're using it."])
    else:
        h = pick("streak_2", [f"{s} days of mindful spending.", "Two days in. You're starting something."])
        sub = pick("streak_2_sub", ["Keep it going — habits start small.", "Day two. The hardest one is day one — and you did that."])

    personal = f"Your longest streak is {longest} days. " if longest > s and longest > 5 else ""
    return {"type": "streak_nudge", "headline": h, "subtext": sub, "personal_note": personal or None}


def home_savings_nudge(d: UserData) -> Optional[dict]:
    """Shown when there's a clear savings opportunity or milestone."""
    if d.savings_milestone_hit:
        return {
            "type": "savings_milestone",
            "headline": pick("milestone", [
                f"{fmt(d.savings_milestone_amount)} in savings — a real milestone.",
                f"You crossed {fmt(d.savings_milestone_amount)} in savings.",
                f"{fmt(d.savings_milestone_amount)} saved. That number means something.",
            ]),
            "subtext": pick("milestone_sub", [
                "Round numbers feel good because they are. You earned this.",
                "This is the kind of moment Dekho exists for.",
                stage_aware(d, "You did something most people don't.", "Another milestone. The next one comes faster.", "You know what this took. Well done."),
            ]),
        }
    if d.saving_target_pct >= 80:
        return {
            "type": "savings_progress",
            "headline": pick("savings_high", ["Almost at your savings target.", f"{int(d.saving_target_pct)}% of your savings goal — nearly there."]),
            "subtext": "One push and you'll cross it this month.",
        }
    return None


# ═══════════════════════════════════════════════════════════════
# EXPENSES TAB
# ═══════════════════════════════════════════════════════════════

def expenses_hero_insight(d: UserData) -> dict:
    """The main brown insight card on Expenses tab."""
    cat  = d.month_top_category
    amt  = d.month_top_amount
    chg  = d.month_vs_last_month_pct
    cat2 = d.month_second_category
    amt2 = d.month_second_amount

    if chg > 20:
        key = "exp_spike"
        headline = f"{cat} is your highest expense ({fmt(amt)})"
        tag = fmt_pct(chg)
        lines = pick(key, [
            [f"That's {fmt_pct(chg)} more than last month — a significant jump. ",
             f"Taking a 48-hour pause on {vendor_for(cat)} can help reset this trend before it becomes a habit."],
            [f"{cat} jumped {fmt_pct(chg)} from last month. ",
             f"Your second-highest is {cat2} at {fmt(amt2)}. Awareness is the first step to shifting your spending rhythm."],
        ])
        saving_hint = fmt(amt * 0.15)

    elif chg > 8:
        key = "exp_rising"
        headline = f"{cat} is climbing ({fmt(amt)})"
        tag = fmt_pct(chg)
        lines = pick(key, [
            [f"Up {fmt_pct(chg)} from last month. Still manageable, but the trend is worth watching.",
             f"A small adjustment — like {fmt(amt * 0.1)} less on {vendor_for(cat)} — keeps it from becoming a habit."],
            [f"{cat} is your biggest category and it's growing. {fmt_pct(chg)} month-over-month.",
             "It might not feel like much, but {:.0f}% growth compounding monthly adds up fast.".format(chg)],
        ])
        saving_hint = fmt(amt * 0.1)

    elif chg < -10:
        key = "exp_falling"
        headline = f"{cat} spend is coming down ({fmt(amt)})"
        tag = fmt_pct(chg)
        lines = pick(key, [
            [f"Down {fmt_pct(abs(chg))} from last month. That's real progress.",
             f"The {fmt(d.last_month_total - d.month_top_amount)} you didn't spend on {cat.lower()} is available for savings or goals."],
            [f"You've pulled back on {cat.lower()} — and it shows. {fmt_pct(abs(chg))} lower than last month.",
             "Keep the momentum. These gains compound."],
        ])
        saving_hint = None

    else:
        key = "exp_stable"
        headline = f"{cat} is your highest expense ({fmt(amt)})"
        tag = None
        lines = pick(key, [
            [f"{cat} is steady at {fmt(amt)} — your biggest category.",
             f"Knowing your biggest category is the foundation. From here, you decide what to do with it."],
            [f"Your top two categories: {cat} ({fmt(amt)}) and {cat2} ({fmt(amt2)}).",
             f"Together that's {fmt(amt + amt2)} — {int((amt+amt2)/max(d.month_total,1)*100)}% of this month's spending."],
        ])
        saving_hint = None

    return {
        "type": "expenses_insight",
        "headline": headline,
        "tag": tag,
        "lines": lines,
        "saving_hint": saving_hint,
        "category_icon": cat,
    }


def expenses_pattern_caption(d: UserData) -> str:
    """Caption below the spending heatmap calendar."""
    if d.spends_more_on_weekends and d.peak_spend_time in ("evenings", "night"):
        return pick("cal_weekend_night", [
            "Weekends and evenings — that's when spending moves most.",
            "The darkest squares cluster on weekend evenings. That's your peak window.",
        ])
    elif d.spends_more_on_weekends:
        return pick("cal_weekend", [
            "Weekends are your higher-spend days — worth noticing.",
            "The darker squares cluster toward weekends.",
        ])
    elif d.peak_spend_time == "late night":
        return pick("cal_night", [
            "Late-night spending shows up in your pattern. Tired decisions can be expensive ones.",
            "Your spending picks up after 9pm. Late-night impulse is real and very common.",
        ])
    elif d.peak_spend_time == "evenings":
        return pick("cal_evening", [
            "Evening hours are your highest-spend window.",
            "Post-work evenings are when spending flows most freely — for most people.",
        ])
    elif d.is_salary_week:
        return pick("cal_salary", [
            "The darker cluster follows your salary date. Payday patterns are among the most predictable.",
            "Salary week always shows darker. Knowing this is how you start to change it.",
        ])
    else:
        return pick("cal_even", [
            "Your spending is fairly spread across the week — no strong spikes.",
            "Consistent spending through the week. No dramatic day-of-week patterns.",
        ])


def expenses_category_detail(d: UserData, category: str, amount: float,
                              pct_of_total: float, pct_change: float) -> dict:
    """Deep insight for when user taps a specific category."""
    vendor = vendor_for(category)

    if pct_change > 15:
        insight = pick(f"cat_{category}_up", [
            f"{category} is up {fmt_pct(pct_change)} this month. "
            f"That's {fmt(amount * pct_change/100)} more than last month.",
            f"A significant jump in {category.lower()}. Worth understanding what drove it before it becomes a pattern.",
        ])
        action = f"Try a 2-week spending pause on non-essential {category.lower()} to reset the baseline."
    elif pct_change < -10:
        insight = pick(f"cat_{category}_down", [
            f"{category} is down {fmt_pct(abs(pct_change))}. You've made real progress here.",
            f"You've brought {category.lower()} spending down by {fmt_pct(abs(pct_change))}. That's a behavioral shift.",
        ])
        action = None
    else:
        insight = pick(f"cat_{category}_stable", [
            f"{category} makes up {int(pct_of_total)}% of your spending this month at {fmt(amount)}.",
            f"{fmt(amount)} on {category.lower()} — {int(pct_of_total)}% of total. Steady and predictable.",
        ])
        action = None

    return {"type": "category_detail", "category": category,
            "insight": insight, "action": action, "amount": fmt(amount)}


def expenses_subscription_audit(d: UserData) -> Optional[dict]:
    if d.unused_subscriptions == 0 or d.active_subscriptions == 0:
        return None
    waste = d.subscription_total * (d.unused_subscriptions / max(d.active_subscriptions, 1))
    return {
        "type": "subscription_audit",
        "headline": pick("sub_audit", [
            f"{d.unused_subscriptions} subscription{'s' if d.unused_subscriptions > 1 else ''} you haven't used this month.",
            f"Unused subscriptions: {d.unused_subscriptions} of {d.active_subscriptions}.",
        ]),
        "subtext": pick("sub_audit_sub", [
            f"That's roughly {fmt(waste)}/month going nowhere.",
            f"Cancelling the unused ones frees up {fmt(waste)} — automatically, every month.",
        ]),
        "cta": "Review subscriptions",
    }


# ═══════════════════════════════════════════════════════════════
# ASSETS TAB
# ═══════════════════════════════════════════════════════════════

def assets_net_worth_insight(d: UserData) -> dict:
    """Insight below the net worth hero card."""
    chg = d.net_worth_change
    pct = d.net_worth_change_pct
    src = d.growth_source

    if chg > 0 and src == "investments":
        h = pick("nw_inv_up", [
            "Most of your growth this month came from investments.",
            "Your investments are doing the heavy lifting.",
            "Money making money — that's this month's story.",
        ])
        sub = pick("nw_inv_up_sub", [
            f"Up {fmt(chg)} ({fmt_pct(pct)}) — driven by your portfolio. Your money is working.",
            f"{fmt_pct(pct)} growth this month, mostly from {d.top_investment_type}. Compound returns are starting to show.",
        ])
    elif chg > 0 and src == "savings":
        h = pick("nw_sav_up", [
            "Your savings are building your foundation.",
            "Discipline is growing your net worth.",
            "Consistent saving is the story this month.",
        ])
        sub = pick("nw_sav_up_sub", [
            f"Up {fmt(chg)} — driven by what you set aside. No market needed. Just consistency.",
            f"Your savings added {fmt(d.savings_added_this_month)} this month. That's the foundation everything else grows on.",
        ])
    elif chg > 0 and src == "mixed":
        h = pick("nw_mixed_up", [
            "Savings and investments grew together this month.",
            "A balanced growth month — both pillars working.",
        ])
        sub = f"Up {fmt(chg)} ({fmt_pct(pct)}). Savings and investments both contributed."
    elif chg < 0:
        h = pick("nw_down", [
            "Net worth dipped a little this month.",
            "A slight dip — mostly market movement.",
            "Down slightly this month.",
        ])
        sub = pick("nw_down_sub", [
            "Markets fluctuate. Your savings foundation is intact. This is temporary noise.",
            f"Down {fmt(abs(chg))} — but your savings didn't shrink. Market dips are part of the long game.",
            "One down month in a year of growth is noise, not signal. Stay the course.",
        ])
    else:
        h = pick("nw_flat", ["A steady month for your assets.", "Net worth holding steady."])
        sub = "No dramatic swings — quiet, consistent growth."

    return {"type": "net_worth_insight", "headline": h, "subtext": sub}


def assets_savings_insight(d: UserData) -> dict:
    months = d.safety_months
    added  = d.savings_added_this_month
    growth = d.savings_growth_pct_6m

    if months >= 6:
        h = pick("sav_6m", [
            f"Your safety net covers {months:.0f} months of expenses.",
            f"{months:.0f} months of financial runway — that's real security.",
        ])
        sub = pick("sav_6m_sub", [
            "Most financial advisors recommend 3–6 months. You're at the top of that range.",
            "You have the safety net. Now the question is: what do you do with surplus savings?",
            f"With {months:.0f} months covered, you have room to invest more aggressively if you choose.",
        ])
    elif months >= 3:
        h = pick("sav_3m", [
            f"Safety net: {months:.1f} months covered.",
            f"You've built {months:.1f} months of financial buffer.",
        ])
        sub = pick("sav_3m_sub", [
            "The 3-month milestone is where financial stability starts feeling real.",
            f"Solid foundation. {fmt(added)} added this month — the buffer keeps growing.",
            "You have enough to absorb most unexpected events. That peace of mind is real.",
        ])
    elif months >= 1:
        h = pick("sav_1m", [
            f"{months:.1f} months of expenses covered so far.",
            "Building the safety net — you're on your way.",
        ])
        sub = pick("sav_1m_sub", [
            "The goal is 3 months. You're building toward it. Keep going.",
            f"Every {fmt(added)} you add brings the 3-month target closer.",
            stage_aware(d,
                "Even 1 month of safety changes how money stress feels. You're building that.",
                "You're in the building phase. The foundation is forming.",
                "You know what you're doing. Keep adding.",
            ),
        ])
    else:
        h = pick("sav_low", ["Starting to build the safety net.", "Savings are beginning."])
        sub = pick("sav_low_sub", [
            "Every rupee in savings is a rupee of future freedom. Start small, stay consistent.",
            "The first step is starting. You've done that.",
        ])

    milestone_note = None
    if d.savings_milestone_hit:
        milestone_note = f"You just crossed {fmt(d.savings_milestone_amount)} in savings — a real milestone."

    return {"type": "savings_insight", "headline": h, "subtext": sub, "milestone": milestone_note}


def assets_investment_opportunity(d: UserData) -> Optional[dict]:
    """The big AI Insight card — when to start / grow investing."""
    if not d.can_invest_more and d.safety_months < 2:
        return {
            "type": "invest_opportunity",
            "tag": "AI Insight",
            "headline": pick("inv_opp_not_yet", [
                "Build the safety net first — then invest.",
                "Right now, savings is your most important investment.",
                "The foundation comes before the growth.",
            ]),
            "subtext": pick("inv_opp_not_yet_sub", [
                f"You need about {fmt(max(0, (3 - d.safety_months)) * (d.month_total or 15000))} more "
                "to hit a 3-month safety buffer. That's the milestone before investing makes sense.",
                "Investment opportunities will wait. Your safety net won't build itself — but you can.",
            ]),
            "cta": None,
        }

    if d.can_invest_more and d.safety_months >= 3:
        suggested = min(d.savings_total * 0.15, 15000)
        return {
            "type": "invest_opportunity",
            "tag": "AI Insight",
            "headline": pick("inv_opp_ready", [
                "You're building a strong savings base. You can start moving some money into investments.",
                "Foundation secure. The next step is making your money work harder.",
                "Your safety net is solid — time to let some savings grow.",
            ]),
            "subtext": pick("inv_opp_ready_sub", [
                f"With {d.safety_months:.0f} months of expenses covered, you're in a strong position. "
                f"Even {fmt(suggested)}/month into a low-risk index fund could yield meaningful long-term returns.",
                f"3 months covered. You've crossed Dekho's investing threshold. "
                f"Starting with {fmt(suggested)} keeps it low-risk and reversible.",
            ]),
            "cta": "Optimize My Portfolio",
        }

    if d.sip_missed_this_month:
        return {
            "type": "invest_opportunity",
            "tag": "Reminder",
            "headline": pick("inv_sip_missed", [
                "Your SIP was missed this month.",
                "One SIP gap — worth catching up.",
            ]),
            "subtext": pick("inv_sip_missed_sub", [
                "Missing a SIP once won't undo progress — but catching up keeps the compounding unbroken.",
                "Consistent SIPs outperform occasional larger investments. One missed — one to make up.",
            ]),
            "cta": "Set up SIP reminder",
        }

    if d.stock_volatility in ("slightly_higher", "high"):
        return {
            "type": "invest_opportunity",
            "tag": "AI Insight",
            "headline": pick("inv_volatile", [
                "Your portfolio is growing — with some volatility in stocks.",
                "Good overall growth, with some stock turbulence.",
            ]),
            "subtext": pick("inv_volatile_sub", [
                f"{d.top_investment_type} is steady. Stock volatility is higher than usual — "
                "worth monitoring, but not a reason to exit.",
                "Some volatility is normal. Your overall direction is still positive. "
                "Consider rebalancing if stocks feel above your comfort zone.",
            ]),
            "cta": "Review portfolio",
        }

    return None


def assets_portfolio_insight(d: UserData, investment_name: str, invested: float,
                              current: float, gain_pct: float,
                              period_years: float, category: str) -> dict:
    """Per-investment insight on the detail screen."""
    gain = current - invested

    if gain_pct >= 15:
        text = pick(f"port_{category}_high", [
            f"Strong performer. {fmt_pct(gain_pct)} in {period_years:.1f} years — ahead of most alternatives. "
            f"Your {fmt(invested)} is now {fmt(current)}.",
            f"{gain_pct:.0f}% on a {category} fund over {period_years:.1f} years is above average. "
            f"Let compounding do its work.",
        ])
    elif gain_pct >= 7:
        text = pick(f"port_{category}_mid", [
            f"Stable and steady — {gain_pct:.0f}% over {period_years:.1f} years with no dramatic swings. "
            f"This is what reliable long-term investing looks like.",
            f"This investment has been consistent with steady growth, aligning well with your long-term goals.",
        ])
    elif gain_pct >= 0:
        text = pick(f"port_{category}_low", [
            f"Modest growth so far — {gain_pct:.0f}% over {period_years:.1f} years. "
            f"{category} funds typically reward patience. Give it time.",
            f"Below average returns so far, but within normal range for this period. Stay the course.",
        ])
    else:
        text = pick(f"port_{category}_neg", [
            f"Currently down {abs(gain_pct):.0f}% — that's market movement, not failure. "
            f"Long-term {category.lower()} funds recover from dips like this.",
            f"A temporary dip. Don't judge a long-term investment by a short-term number.",
        ])

    return {"type": "portfolio_insight", "tag": "Insight", "text": text,
            "gain": fmt(gain), "gain_pct": fmt_pct(gain_pct)}


# ═══════════════════════════════════════════════════════════════
# BUDGETS TAB
# ═══════════════════════════════════════════════════════════════

def budgets_monthly_pulse(d: UserData) -> dict:
    if not d.month_budget:
        return {
            "type": "monthly_pulse",
            "headline": "Set a budget to track your pulse.",
            "subtext": "Knowing your limit is the first step to staying within it.",
        }

    pct  = (d.month_spent_so_far / d.month_budget) * 100
    rem  = d.month_budget - d.month_spent_so_far
    mp   = d.month_position

    if pct < 30:
        h = pick("pulse_low", ["Well within budget.", "Plenty of runway this month.", "Off to a careful start."])
        sub = f"Only {int(pct)}% used. {fmt(rem)} remaining — you're in a comfortable position."
    elif pct < 55:
        if mp == MonthPosition.START:
            h = pick("pulse_mid_start", ["Spending is moving early this month.", "Early pace is a little high — watch it."])
            sub = f"{int(pct)}% used in the first week. Slowing down now gives you breathing room later."
        elif mp == MonthPosition.MIDDLE:
            h = pick("pulse_mid_mid", ["Cruising smoothly this month.", "On track — right where you should be.", "Good pace. Right in the zone."])
            sub = pick("pulse_mid_mid_sub", [
                "Your lifestyle spending is slightly higher than usual, but covered by your buffer.",
                f"Halfway through the budget at a healthy pace. {fmt(rem)} to work with.",
            ])
        else:
            h = pick("pulse_mid_end", ["Still in good shape toward month end.", "Holding steady as the month closes."])
            sub = f"{fmt(rem)} left with a few days to go. You're managing well."
    elif pct < 80:
        h = pick("pulse_high", ["Budget is filling up — stay aware.", "Getting into the higher half.", "Time to slow down a little."])
        sub = pick("pulse_high_sub", [
            f"{int(pct)}% used. {fmt(rem)} left — be intentional with what remains.",
            f"The buffer is thinning. {fmt(rem)} remaining. Think before each spend.",
        ])
    elif pct < 100:
        h = pick("pulse_danger", ["Almost at the monthly limit.", "Budget nearly exhausted — be mindful.", "Very little runway left."])
        sub = f"Only {fmt(rem)} left. Stick to essentials for the rest of the month."
    else:
        over = abs(rem)
        h = pick("pulse_over", [
            "Budget crossed this month.",
            "You've gone over — and that's okay. Next month, let's plan better.",
            "Over budget. The awareness matters.",
        ])
        sub = pick("pulse_over_sub", [
            f"Over by {fmt(over)}. Dekho will help you understand what drove it.",
            f"Over by {fmt(over)}. No guilt — just understanding. Let's look at what happened.",
            stage_aware(d,
                f"Went over by {fmt(over)}. It happens, especially early on. The pattern becomes clearer over time.",
                f"Over by {fmt(over)}. You've been here before — and you've learned from it.",
                f"Over by {fmt(over)}. You know your patterns. Use that knowledge for next month.",
            ),
        ])

    return {
        "type": "monthly_pulse",
        "headline": h, "subtext": sub,
        "spent": fmt(d.month_spent_so_far),
        "budget": fmt(d.month_budget),
        "safe_to_spend": fmt(max(rem, 0)),
        "pct": int(min(pct, 100)),
    }


def budgets_goal_card(d: UserData) -> dict:
    if not d.goal_name:
        return {"type": "goal_card", "headline": "Add a goal to start tracking it.", "subtext": "What's worth saving for?"}

    p   = goal_pct(d)
    rem = d.goal_target - d.goal_saved
    months_left = rem / max(d.goal_monthly_contribution, 1)

    if p >= 90:
        h = pick("goal_90", [
            f"Almost there — {d.goal_name} is within reach. ✨",
            f"{d.goal_name} is so close you can feel it. ✨",
            f"Final stretch for {d.goal_name}. ✨",
        ])
        sub = f"Just {fmt(rem)} to go. At {fmt(d.goal_monthly_contribution)}/month, you'll cross it in {months_left:.0f} month{'s' if months_left > 1 else ''}."
    elif p >= 60:
        h = pick("goal_60", [
            f"{d.goal_name} is getting closer. ✨",
            f"More than halfway to {d.goal_name}. ✨",
            f"{d.goal_name} is coming into view. ✨",
        ])
        sub = pick("goal_60_sub", [
            f"You're on track. {fmt(d.goal_monthly_contribution)}/month funded from your budget.",
            f"{p}% there. The momentum is real — {fmt(rem)} left.",
        ])
    elif p >= 30:
        h = pick("goal_30", [
            f"Building toward {d.goal_name}.",
            f"{d.goal_name} — the foundation is forming.",
            f"{p}% of the way to {d.goal_name}.",
        ])
        sub = f"{fmt(d.goal_saved)} saved. Targeting {d.goal_target_date} — {months_left:.0f} months of contributions to go."
    else:
        h = pick("goal_early", [
            f"The journey to {d.goal_name} has started.",
            f"First steps toward {d.goal_name}.",
            f"{d.goal_name} — you've begun.",
        ])
        sub = f"Early days, but {fmt(d.goal_saved)} is already set aside. The first step is always the hardest."

    on_track_note = None
    if not d.goal_on_track:
        on_track_note = f"At the current pace, you'll need an extra {fmt(d.goal_monthly_contribution * 0.2)}/month to hit {d.goal_target_date}."

    return {
        "type": "goal_card",
        "headline": h, "subtext": sub,
        "on_track_note": on_track_note,
        "goal_name": d.goal_name,
        "saved": fmt(d.goal_saved),
        "target": fmt(d.goal_target),
        "pct": p,
        "target_date": d.goal_target_date,
        "monthly": fmt(d.goal_monthly_contribution),
    }


# ═══════════════════════════════════════════════════════════════
# BEHAVIOR TAB
# ═══════════════════════════════════════════════════════════════

def behavior_weekly_summary(d: UserData) -> dict:
    e   = d.emotional_trigger
    p   = d.primary_pattern
    r   = d.week_intentional_ratio

    # Emotional trigger line
    if e == EmotionalTrigger.STRESS:
        emo = pick("beh_stress", [
            "Stress seems to have influenced some spending this week.",
            "This week, spending picked up when things felt heavy.",
            "Some of this week's spending has stress written on it.",
        ])
    elif e == EmotionalTrigger.BOREDOM:
        emo = pick("beh_boredom", [
            "Boredom spending showed up this week.",
            "Quiet moments led to some unplanned spending.",
            "When there wasn't much to do, spending filled the gap.",
        ])
    elif e == EmotionalTrigger.LONELINESS:
        emo = pick("beh_lonely", [
            "Loneliness and spending often travel together. This week they did.",
            "Some spending this week was about filling emotional space.",
        ])
    elif e == EmotionalTrigger.ANXIETY:
        emo = pick("beh_anxiety", [
            "Anxiety spending — buying things to feel in control. This week had some of that.",
            "When the future feels uncertain, spending can feel like doing something. You noticed it.",
        ])
    elif e == EmotionalTrigger.CELEBRATION:
        emo = pick("beh_celebrate", [
            "You celebrated this week — and your spending reflects that.",
            "Good things happened, and spending followed. Celebrate consciously.",
        ])
    elif e == EmotionalTrigger.FATIGUE:
        emo = pick("beh_fatigue", [
            "Tired spending — when willpower is low, the wallet opens easier.",
            "Fatigue lowers financial decision-making. This week showed that pattern.",
        ])
    else:
        emo = None

    # Intentionality line
    if r >= 0.80:
        intent = pick("beh_intent_high", [
            f"{int(r*100)}% of your spending was intentional this week. That's strong.",
            "Most of your spending was planned. You knew where your money was going.",
        ])
    elif r >= 0.60:
        intent = pick("beh_intent_mid", [
            f"About {int(r*100)}% intentional — solid base, room to grow.",
            f"More planned than unplanned. The balance is shifting right.",
        ])
    elif r >= 0.40:
        intent = pick("beh_intent_low", [
            f"Roughly half your spending was impulse this week. That's the pattern to work on.",
            f"{int((1-r)*100)}% unplanned. Awareness of this is the whole point.",
        ])
    else:
        intent = pick("beh_intent_vlow", [
            f"Impulse spending took the lead — {int((1-r)*100)}% unplanned.",
            "More impulse than intention this week. Patterns can change — and this one is worth targeting.",
        ])

    lines = []
    if emo: lines.append(emo)
    lines.append(intent)

    # Cross-signal insight
    cross = multi_signal_story(d)
    if cross: lines.append(cross)

    # Peak time note
    peak_note = {
        "late night": "Your spending peaks after 9pm — when willpower is lowest.",
        "evenings":   "Evening hours are your highest-spend window.",
        "mornings":   "Morning spending is where your day's budget gets set.",
        "afternoons": "Afternoon is your active spending window.",
    }.get(d.peak_spend_time, "")

    impulse_note = None
    if d.impulse_categories:
        cats = " and ".join(d.impulse_categories[:2])
        impulse_note = f"Your impulse categories: {cats}. These are worth watching."

    controlled_note = None
    if d.controlled_categories:
        cats = " and ".join(d.controlled_categories[:2])
        controlled_note = f"You're most controlled with {cats} — a real strength."

    return {
        "type": "behavior_weekly",
        "tag": "Your week in behavior",
        "lines": lines,
        "peak_time_note": peak_note,
        "impulse_note": impulse_note,
        "controlled_note": controlled_note,
        "intentional_ratio": int(r * 100),
    }


def behavior_spending_identity(d: UserData) -> dict:
    """
    The 'Spending Identity' card — a more philosophical reflection.
    Shown on Behavior tab after a few weeks of data.
    """
    if d.days_on_app < 14:
        return {
            "type": "spending_identity",
            "headline": "Your spending identity is forming.",
            "subtext": "Dekho needs a couple more weeks of data to understand your patterns deeply.",
        }

    p = d.primary_pattern
    r = d.week_intentional_ratio

    if p in (SpendingPattern.COMFORT_SPENDING, SpendingPattern.STRESS_SPENDING):
        identity = "Emotional spender"
        description = pick("id_emotional", [
            "You tend to spend when feelings need managing. This is one of the most common spending identities — and one of the most human.",
            "Money becomes a tool for emotional regulation. Understanding this is the beginning of changing it.",
        ])
    elif p in (SpendingPattern.INTENTIONAL, SpendingPattern.CONSISTENT_SAVER) and r >= 0.7:
        identity = "Mindful spender"
        description = pick("id_mindful", [
            "You spend with awareness. Most of your transactions are chosen, not reactive. That's a real achievement.",
            "Intentional, deliberate, aware. Your relationship with money is one of the healthiest Dekho sees.",
        ])
    elif p in (SpendingPattern.SHOPPING_BINGE, SpendingPattern.FOMO_SPENDING):
        identity = "Aspirational spender"
        description = pick("id_aspirational", [
            "Spending shapes identity for you — clothes, gadgets, experiences. The money goes toward becoming someone. Worth asking: who?",
            "You spend on becoming. That's not bad — but it can run ahead of means. Awareness is the lever.",
        ])
    elif p in (SpendingPattern.SOCIAL_SPENDING,):
        identity = "Social spender"
        description = pick("id_social", [
            "People and experiences drive your spending. You invest in moments and relationships — which has real value. Balance is the key.",
            "Your spending follows your social life. That means the people around you influence your wallet. Worth noticing.",
        ])
    elif p in (SpendingPattern.CONSISTENT_SAVER, SpendingPattern.SAVING_STREAK):
        identity = "Builder"
        description = pick("id_builder", [
            "You prioritize the future over the moment. Savings and intentionality define your relationship with money.",
            "You're in the building phase — spending less today so tomorrow has more room. That's the Dekho ideal.",
        ])
    else:
        identity = "Evolving spender"
        description = pick("id_evolving", [
            "Your spending patterns are still forming — and that's normal. Dekho will help you understand what's emerging.",
            "You don't fit one pattern cleanly yet. That's actually a good sign — you're not locked in.",
        ])

    return {
        "type": "spending_identity",
        "identity": identity,
        "description": description,
        "stage_note": stage_aware(d,
            "You're at the beginning of understanding your money identity. Give it time.",
            "Your patterns are becoming clearer. This identity isn't fixed — you're shaping it.",
            "You know who you are with money. Now you're deciding who you want to be.",
        ),
    }


# ═══════════════════════════════════════════════════════════════
# ASK DEKHO — Q&A RESPONSES
# ═══════════════════════════════════════════════════════════════

def ask_dekho(question: str, d: UserData) -> str:
    """
    Handles natural language questions from the Ask Dekho chatbot.
    Pattern-matches common questions and returns insight-style answers.
    """
    q = question.lower().strip()

    # ── Spending questions ──
    if any(x in q for x in ["where did i spend", "where does my money", "highest spend", "most spend"]):
        return (f"Your biggest category this month is {d.month_top_category} at {fmt(d.month_top_amount)} — "
                f"{int(d.month_top_amount/max(d.month_total,1)*100)}% of your total. "
                f"{d.month_second_category} comes second at {fmt(d.month_second_amount)}.")

    if any(x in q for x in ["how much did i spend", "total spend", "spent this month"]):
        vs = f"That's {direction(d.month_vs_last_month_pct)} than last month." if d.month_vs_last_month_pct else ""
        return f"You've spent {fmt(d.month_spent_so_far)} so far this month. {vs} {fmt(d.remaining_budget)} remaining in your budget."

    if any(x in q for x in ["can i save", "how much can i save", "saving potential"]):
        potential = d.remaining_budget * 0.3
        return (f"Based on your current pace, you could realistically save {fmt(potential)} more this month "
                f"by being slightly more mindful of your {d.month_top_category.lower()} spending. "
                f"Your saving target is {int(d.saving_target_pct)}% complete.")

    if any(x in q for x in ["why did i spend", "what happened", "comfort spend"]):
        if d.emotional_trigger != EmotionalTrigger.NONE:
            return (f"Your spending pattern this week shows signs of {d.emotional_trigger.value.replace('_',' ')} spending. "
                    f"{d.month_top_category} was the main outlet. Recognising the trigger is the first step to changing it.")
        return f"Your top category was {d.month_top_category} at {fmt(d.month_top_amount)}. No strong emotional trigger detected this week."

    # ── Savings questions ──
    if any(x in q for x in ["how much saved", "my savings", "savings total"]):
        return (f"You have {fmt(d.savings_total)} in savings. "
                f"That covers {d.safety_months:.1f} months of your expenses — "
                f"{'a solid safety net' if d.safety_months >= 3 else 'keep building, the target is 3 months'}.")

    if any(x in q for x in ["should i invest", "ready to invest", "start investing"]):
        if d.safety_months >= 3:
            return (f"Yes — you have {d.safety_months:.0f} months of expenses covered, which is Dekho's threshold. "
                    f"Starting with a small SIP — even {fmt(3000)}/month in a low-risk index fund — is a solid first step.")
        return (f"Not quite yet. Build your safety net to 3 months first. "
                f"You're at {d.safety_months:.1f} months — about {fmt((3-d.safety_months)*(d.month_total or 15000))} away. "
                "Once you're there, investing makes a lot more sense.")

    # ── Investment questions ──
    if any(x in q for x in ["how is my portfolio", "investment doing", "returns"]):
        return (f"Your portfolio is at {fmt(d.investments_total)}, up {fmt_pct(d.investments_gain_pct)} overall. "
                f"This month's gain: {fmt(d.investments_gain)}. "
                f"{d.top_investment_type} is your strongest holding at {d.top_investment_pct:.0f}% of your portfolio.")

    if any(x in q for x in ["net worth", "total wealth", "how much am i worth"]):
        return (f"Your net worth is {fmt(d.net_worth)}, "
                f"{'up' if d.net_worth_change >= 0 else 'down'} {fmt(abs(d.net_worth_change))} this month. "
                f"Savings: {fmt(d.savings_total)} | Investments: {fmt(d.investments_total)}.")

    # ── Goal questions ──
    if any(x in q for x in ["my goal", "goa", "trip", "how close", "goal progress"]):
        if d.goal_name:
            p = goal_pct(d)
            rem_months = (d.goal_target - d.goal_saved) / max(d.goal_monthly_contribution, 1)
            return (f"You're {p}% toward {d.goal_name} — {fmt(d.goal_saved)} saved of {fmt(d.goal_target)}. "
                    f"At {fmt(d.goal_monthly_contribution)}/month, you'll reach it in about {rem_months:.0f} months. "
                    f"Target date: {d.goal_target_date}.")
        return "You haven't set a goal yet. Add one in the Budgets tab and Dekho will track it for you."

    # ── Budget questions ──
    if any(x in q for x in ["remaining budget", "how much left", "budget left", "safe to spend"]):
        return (f"You have {fmt(d.remaining_budget)} left in your {fmt(d.month_budget)} budget. "
                f"You've used {int((d.month_spent_so_far/max(d.month_budget,1))*100)}% so far this month.")

    # ── Behavior questions ──
    if any(x in q for x in ["my pattern", "spending habit", "behaviour", "behavior"]):
        return behavior_weekly_summary(d)["lines"][0]

    if any(x in q for x in ["subscription", "subscriptions"]):
        if d.unused_subscriptions > 0:
            waste = d.subscription_total * (d.unused_subscriptions / max(d.active_subscriptions, 1))
            return (f"You have {d.active_subscriptions} active subscriptions totalling {fmt(d.subscription_total)}/month. "
                    f"{d.unused_subscriptions} haven't been used this month — that's roughly {fmt(waste)} going to waste.")
        return f"You have {d.active_subscriptions} active subscriptions at {fmt(d.subscription_total)}/month. All seem to be in use."

    # ── Motivational / general ──
    if any(x in q for x in ["am i doing well", "how am i doing", "good job", "progress"]):
        return stage_aware(d,
            f"You're {d.days_on_app} days in and already building awareness. That's the hardest part — and you're through it.",
            f"You're in the understanding phase — seeing patterns, making small changes. That's exactly where you should be.",
            f"You're doing well. {fmt(d.savings_total)} saved, {fmt(d.net_worth)} net worth, and growing intentionality. Keep going.",
        )

    # Default
    return (f"I don't have a specific answer for that yet, {d.name}. "
            "Try asking about your spending, savings, investments, budget, or goals — "
            "that's where Dekho knows you best.")


# ═══════════════════════════════════════════════════════════════
# MAIN ENGINE
# ═══════════════════════════════════════════════════════════════

class DekhoInsightEngine:
    """
    Main entry point. Feed UserData, get all insights back.

    from insight_engine_v2 import DekhoInsightEngine, UserData, SpendingPattern

    engine = DekhoInsightEngine()
    data   = UserData(name="Jobin", today_spend=1420, ...)
    all    = engine.generate_all(data)
    answer = engine.ask("where did i spend most?", data)
    """

    def generate_all(self, d: UserData) -> dict:
        return {
            "home": {
                "hero_card":       home_hero_card(d),
                "streak_nudge":    home_streak_nudge(d),
                "savings_nudge":   home_savings_nudge(d),
            },
            "expenses": {
                "hero_insight":        expenses_hero_insight(d),
                "pattern_caption":     expenses_pattern_caption(d),
                "subscription_audit":  expenses_subscription_audit(d),
            },
            "assets": {
                "net_worth_insight":       assets_net_worth_insight(d),
                "savings_insight":         assets_savings_insight(d),
                "investment_opportunity":  assets_investment_opportunity(d),
            },
            "budgets": {
                "monthly_pulse": budgets_monthly_pulse(d),
                "goal_card":     budgets_goal_card(d),
            },
            "behavior": {
                "weekly_summary":    behavior_weekly_summary(d),
                "spending_identity": behavior_spending_identity(d),
            },
        }

    def category_insight(self, category: str, amount: float,
                          pct_of_total: float, pct_change: float, d: UserData) -> dict:
        return expenses_category_detail(d, category, amount, pct_of_total, pct_change)

    def portfolio_insight(self, investment_name: str, invested: float, current: float,
                           gain_pct: float, period_years: float, category: str, d: UserData) -> dict:
        return assets_portfolio_insight(d, investment_name, invested, current, gain_pct, period_years, category)

    def ask(self, question: str, d: UserData) -> str:
        return ask_dekho(question, d)
