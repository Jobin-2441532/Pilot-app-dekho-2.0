import os
import json
from datetime import datetime, date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.notification import Notification, PushSubscription
from app.models.transaction import Transaction
from app.models.financial import Budget
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler
from pytz import timezone

def send_web_push(subscription: PushSubscription, payload: dict):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth
                }
            },
            data=json.dumps(payload),
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY"),
            vapid_claims={
                "sub": os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@dekho.app")
            }
        )
    except WebPushException as ex:
        print("Web Push Failed:", ex)
        if ex.response and ex.response.status_code == 410:
            # Subscription expired or unsubscribed, should delete
            with SessionLocal() as db:
                db.delete(subscription)
                db.commit()

def dispatch_notification(db: Session, user: User, rule_type: str, title: str, message: str):
    # Check limit of 3 per day
    today_start = datetime.combine(date.today(), datetime.min.time())
    count_today = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.created_at >= today_start
    ).count()

    if count_today >= 3:
        return # Skip if already sent 3 today

    # Create DB record
    n = Notification(
        user_id=user.id,
        rule_type=rule_type,
        title=title,
        message=message
    )
    db.add(n)
    db.commit()

    # Send Web Push
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    for sub in subs:
        send_web_push(sub, {
            "title": title,
            "body": message,
            "url": "/"
        })

def evaluate_morning_rules():
    with SessionLocal() as db:
        users = db.query(User).all()
        today_str = date.today().isoformat()
        current_month = today_str[:7]
        for u in users:
            budgets = db.query(Budget).filter(Budget.user_id == u.id, Budget.month == current_month).all()
            high_budget = None
            for b in budgets:
                if b.monthly_limit > 0:
                    spent = db.query(func.sum(Transaction.amount)).filter(
                        Transaction.user_id == u.id,
                        Transaction.category == b.category,
                        Transaction.direction == 'debit',
                        Transaction.date.like(f"{current_month}%")
                    ).scalar() or 0
                    if spent >= (b.monthly_limit * 0.8):
                        high_budget = b
                        break
            
            if high_budget:
                dispatch_notification(db, u, "budget_checkin", "High Budget Alert", f"You've used over 80% of your {high_budget.category} budget. Let's pace it today.")
            elif datetime.now().weekday() == 0:
                dispatch_notification(db, u, "weekly_reset", "Weekly Reset", "A fresh week is here. Take 2 mins to review last week's spending.")
            else:
                dispatch_notification(db, u, "morning_checkin", "Morning Check-in", "Tap to open Dekho and start your day with full financial clarity.")

def evaluate_afternoon_rules():
    with SessionLocal() as db:
        users = db.query(User).all()
        today_str = date.today().isoformat()
        yesterday_str = (date.today() - timedelta(days=1)).isoformat()
        
        for u in users:
            tx_today = db.query(Transaction).filter(
                Transaction.user_id == u.id,
                Transaction.date == today_str
            ).count()
            
            if tx_today > 0:
                dispatch_notification(db, u, "daily_reflection", "Daily Reflection", f"You've logged {tx_today} transactions today. Great job keeping track!")
                continue
                
            large_tx_yesterday = db.query(Transaction).filter(
                Transaction.user_id == u.id,
                Transaction.date == yesterday_str,
                Transaction.amount > 2000
            ).first()
            
            if large_tx_yesterday:
                dispatch_notification(db, u, "big_spender", "Big Spender", "Yesterday had some heavy spending. Taking it easy today?")
            else:
                dispatch_notification(db, u, "afternoon_nudge", "Afternoon Nudge", "Did you grab coffee or lunch? Log it now while it's fresh in your mind.")

def evaluate_night_rules():
    with SessionLocal() as db:
        users = db.query(User).all()
        today_date = date.today()
        today_str = today_date.isoformat()
        
        for u in users:
            tx_today = db.query(Transaction).filter(
                Transaction.user_id == u.id,
                Transaction.date == today_str
            ).count()
            
            total_tx = db.query(Transaction).filter(Transaction.user_id == u.id).count()
            
            if total_tx > 0 and total_tx % 10 == 0:
                dispatch_notification(db, u, "milestone", "Milestone Reached", f"That's {total_tx} spends logged. A real picture is forming.")
            elif tx_today == 0:
                dispatch_notification(db, u, "log_nudge", "End of Day", "A quiet page today — anything to add before the day closes?")
            elif datetime.now().weekday() == 4:
                dispatch_notification(db, u, "weekend_pattern", "Weekend Ready", "Watch out for weekend spending patterns!")
            else:
                spent_today = db.query(func.sum(Transaction.amount)).filter(
                    Transaction.user_id == u.id,
                    Transaction.date == today_str,
                    Transaction.direction == 'debit'
                ).scalar() or 0
                dispatch_notification(db, u, "night_wrapup", "End of Day Wrap-up", f"You spent INR {spent_today:,.2f} today. Tap to review your dashboard.")

def start_scheduler():
    scheduler = BackgroundScheduler(timezone=timezone('Asia/Kolkata'))
    # Morning: 9:00 AM
    scheduler.add_job(evaluate_morning_rules, 'cron', hour=9, minute=0)
    # Afternoon: 2:00 PM
    scheduler.add_job(evaluate_afternoon_rules, 'cron', hour=14, minute=0)
    # Night: 9:00 PM
    scheduler.add_job(evaluate_night_rules, 'cron', hour=21, minute=0)
    
    scheduler.start()
    return scheduler
