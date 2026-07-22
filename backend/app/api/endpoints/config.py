import os
import json
from fastapi import APIRouter

router = APIRouter()

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'app_config.json')

@router.get("/maintenance")
def get_maintenance_status():
    try:
        with open(CONFIG_PATH, 'r') as f:
            config = json.load(f)
            return {"maintenance_mode": config.get("maintenance_mode", False)}
    except Exception:
        return {"maintenance_mode": False}
