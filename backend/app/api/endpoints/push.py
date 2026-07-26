from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.endpoints.auth import get_current_user
from app.models.user import User
from app.models.notification import PushSubscription
from pydantic import BaseModel
import json

router = APIRouter()

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict

@router.post("/subscribe")
def subscribe(
    sub_data: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if subscription already exists
    existing = db.query(PushSubscription).filter_by(
        user_id=current_user.id,
        endpoint=sub_data.endpoint
    ).first()
    
    if not existing:
        new_sub = PushSubscription(
            user_id=current_user.id,
            endpoint=sub_data.endpoint,
            p256dh=sub_data.keys.get("p256dh", ""),
            auth=sub_data.keys.get("auth", "")
        )
        db.add(new_sub)
        db.commit()
    
    return {"status": "subscribed"}

class PushUnsubscribeRequest(BaseModel):
    endpoint: str

@router.post("/unsubscribe")
def unsubscribe(
    sub_data: PushUnsubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(PushSubscription).filter_by(
        user_id=current_user.id,
        endpoint=sub_data.endpoint
    ).delete()
    db.commit()
    return {"status": "unsubscribed"}

@router.post("/test-all")
def test_all_push(db: Session = Depends(get_db)):
    from app.tasks.notification_engine import send_web_push
    subs = db.query(PushSubscription).all()
    count = 0
    for sub in subs:
        send_web_push(sub, {
            "title": "Test Notification",
            "body": "This is a test notification from Dekho!",
            "url": "/"
        })
        count += 1
@router.post("/debug-push")
def debug_push(db: Session = Depends(get_db)):
    from pywebpush import webpush, WebPushException
    import os
    subs = db.query(PushSubscription).all()
    results = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth
                    }
                },
                data=json.dumps({"title": "Debug", "body": "Debug push", "url": "/"}),
                vapid_private_key=os.getenv("VAPID_PRIVATE_KEY") or "gQzI9vp_Fyp_gc1TXTSl-ne3djK9O2G-E6in0FSNBEo",
                vapid_claims={"sub": os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@dekho.app")}
            )
            results.append({"endpoint": sub.endpoint, "status": "success"})
        except Exception as e:
            results.append({"endpoint": sub.endpoint, "status": "error", "error": str(e), "type": type(e).__name__})
    return {"results": results}

@router.get("/cron")
def run_cron_jobs():
    from app.tasks.notification_engine import evaluate_morning_rules, evaluate_afternoon_rules, evaluate_night_rules
    from datetime import datetime
    import pytz
    
    ist = pytz.timezone('Asia/Kolkata')
    now = datetime.now(ist)
    
    if 9 <= now.hour < 14:
        evaluate_morning_rules()
        return {"status": "ran morning rules"}
    elif 14 <= now.hour < 21:
        evaluate_afternoon_rules()
        return {"status": "ran afternoon rules"}
    elif now.hour >= 21 or now.hour < 3:
        evaluate_night_rules()
        return {"status": "ran night rules"}
        
    return {"status": "no rules to run right now"}
