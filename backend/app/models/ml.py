"""
ML-related models:
  - Recommendation       : AI-generated financial tips
  - MerchantMapping      : Per-user learned merchant → category corrections
  - FeedbackLog          : History of user category corrections (triggers ML retraining)
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    why = Column(String)
    cta = Column(String)
    tag = Column(String)   # Safety first / Wealth building / Quick saving
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="recommendations")


class MerchantMapping(Base):
    """
    Per-user mapping of a normalised merchant key to a category.
    When a user corrects a transaction's category, we upsert here.
    On next classification, this takes priority over the ML model
    (confidence_override = 1.0).
    """
    __tablename__ = "merchant_mappings"
    __table_args__ = (
        UniqueConstraint("user_id", "merchant_key", name="uq_user_merchant"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    merchant_key = Column(String, nullable=False)       # lowercase normalised merchant name or VPA prefix
    category = Column(String, nullable=False)
    sub_category = Column(String, nullable=False, default="")
    confidence_override = Column(Float, default=1.0)
    usage_count = Column(Integer, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="merchant_mappings")


class FeedbackLog(Base):
    """
    Logs every time a user corrects a transaction category.
    Once 5+ corrections accumulate, ML retraining is triggered.
    """
    __tablename__ = "feedback_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    original_category = Column(String, nullable=False)
    corrected_category = Column(String, nullable=False)
    original_confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="feedback_logs")
