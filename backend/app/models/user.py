from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=True)  # nullable for existing seeded users
    goal_type = Column(String)
    risk_comfort = Column(String)
    monthly_budget = Column(Float)
    financial_stage = Column(String)
    dekho_wallet_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())

    current_streak_days = Column(Integer, default=0)
    last_checkin_date = Column(Date, nullable=True)
    last_hero_mode = Column(String, nullable=True)
    last_mode_d_date = Column(Date, nullable=True)
    has_completed_tour = Column(Boolean, default=False)

    transactions = relationship("Transaction", back_populates="user")
    savings_goals = relationship("SavingsGoal", back_populates="user")
    budgets = relationship("Budget", back_populates="user")
    assets = relationship("Asset", back_populates="user")
    uploaded_files = relationship("UploadedFile", back_populates="user")
    recommendations = relationship("Recommendation", back_populates="user")
    merchant_mappings = relationship("MerchantMapping", back_populates="user")
    feedback_logs = relationship("FeedbackLog", back_populates="user")
    app_feedback = relationship("AppFeedback", back_populates="user")

