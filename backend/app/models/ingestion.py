from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    file_size = Column(Integer)
    file_type = Column(String)                          # pdf / csv
    storage_path = Column(String)                       # local fallback path
    s3_key = Column(String)                             # MinIO object key
    status = Column(String, default="uploaded")         # uploaded/processing/completed/failed
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="uploaded_files")

class RawRecord(Base):
    __tablename__ = "raw_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=True)
    raw_text = Column(String, nullable=False)            # original text
    raw_data = Column(String)                            # alias used by SMS path
    source_type = Column(String)                         # sms / pdf / csv
    parsed_status = Column(String, default="pending")    # pending/processed/unrecognised
    created_at = Column(DateTime, server_default=func.now())

