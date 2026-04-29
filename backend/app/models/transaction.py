from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Core fields
    date = Column(String, nullable=False)
    merchant = Column(String)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="INR")

    # Direction & type
    direction = Column(String)          # debit / credit
    tx_type = Column(String)            # alias for direction (ML compat)

    # Payment details
    payment_mode = Column(String)       # UPI / CARD / ATM / NEFT / IMPS / WALLET
    vpa = Column(String)                # UPI VPA e.g. zomato@upi
    bank = Column(String)               # HDFC / ICICI / SBI etc.
    account_ref = Column(String)        # masked account ref e.g. XXXX1234

    # Categorisation
    category = Column(String)
    sub_category = Column(String)
    confidence = Column(Float, default=0.0)     # ML confidence 0.0–1.0
    review_status = Column(String, default="pending")  # pending/reviewed/auto_assigned

    # Source tracking
    source_type = Column(String)        # pdf / csv / sms
    source_reference_id = Column(Integer, nullable=True)
    raw_sms = Column(String)            # original SMS text if source is sms

    # Smart flags (ML-assigned)
    is_recurring = Column(Boolean, default=False)
    is_refund = Column(Boolean, default=False)
    is_cashback = Column(Boolean, default=False)
    is_income = Column(Boolean, default=False)
    is_transfer = Column(Boolean, default=False)
    is_wallet_load = Column(Boolean, default=False)

    # Computed amounts
    net_amount = Column(Float)          # amount after refund/cashback applied
    tags = Column(String)               # comma-separated: recurring,refund,p2p

    notes = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="transactions")

