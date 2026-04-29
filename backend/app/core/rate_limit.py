"""
Rate limiter setup using slowapi.
Import `limiter` and apply the @limiter.limit("N/minute") decorator to endpoints.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Key function: use the real client IP (works behind proxies too)
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
