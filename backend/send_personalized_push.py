import os
from datetime import date
from dotenv import load_dotenv
load_dotenv()
from app.core.database import SessionLocal
from app.models.user import User
from app.models.transaction import Transaction
from app.tasks.notification_engine import dispatch_notification

db = SessionLocal()
users = db.query(User).all()
print(f'Evaluating notifications for {len(users)} users...')

today_str = date.today().isoformat()

for u in users:
    # Get total tx
    total_tx = db.query(Transaction).filter(Transaction.user_id == u.id).count()
    tx_today = db.query(Transaction).filter(Transaction.user_id == u.id, Transaction.date == today_str).count()
    
    title = 'Dekho Update'
    msg = 'Keep an eye on your finances with Dekho!'
    rule = 'generic'
    
    if total_tx > 0 and total_tx % 10 == 0:
        title = 'Milestone Reached \U0001f389'
        msg = f'That is {total_tx} spends logged - a real picture is starting to form.'
        rule = 'milestone'
    elif tx_today == 0:
        title = 'End of Day \U0001f319'
        msg = 'A quiet page today \u2014 anything to add before the day closes?'
        rule = 'log_nudge'
    elif getattr(u, 'current_streak_days', 0) >= 1:
        title = 'Streak Active \U0001f525'
        msg = f'Your streak is at {u.current_streak_days} \u2014 a quick log keeps it going.'
        rule = 'streak_at_risk'
    elif tx_today > 0:
        title = 'Daily Reflection \U0001f4dd'
        msg = 'Today had a balanced flavour - see what shaped it.'
        rule = 'daily_reflection'
        
    print(f'Sending {rule} to user {u.email} ({u.name})')
    dispatch_notification(db, u, rule, title, msg)

print('Done.')

