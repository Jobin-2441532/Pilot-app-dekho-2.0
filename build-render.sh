#!/bin/bash
echo "==> Installing Backend Requirements..."
pip install -r backend/requirements.txt

echo "==> Installing ML Service Requirements..."
pip install -r ml_service/requirements.txt

echo "==> Installing Chatbot Requirements..."
pip install -r Dekho_Chatbot_2.0/chatbot-backend/requirements.txt
