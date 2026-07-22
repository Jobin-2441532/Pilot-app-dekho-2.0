from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class AppFeedback(Base):
    __tablename__ = "app_feedback"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feedback_type = Column(String, nullable=False) # bug, feature, general, support
    title = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    expected_behavior = Column(Text, nullable=True)
    device_info = Column(String, nullable=True)
    rating = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="app_feedback")
