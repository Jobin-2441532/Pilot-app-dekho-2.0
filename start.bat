@echo off
echo [Dekho] Clearing port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8002.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 3 >nul

echo [Dekho] Starting backend on 127.0.0.1:8000...
cd /d "%~dp0backend"
start "Dekho Backend" cmd /k "venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [Dekho] Starting ML Service on 127.0.0.1:8001...
cd /d "%~dp0ml_service"
start "Dekho ML Service" cmd /k "..\backend\venv\Scripts\python main.py"

echo [Dekho] Starting Chatbot 2.0 on 127.0.0.1:8002...
cd /d "%~dp0Dekho_Chatbot_2.0\chatbot-backend"
start "Dekho Chatbot" cmd /k "venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8002"

echo [Dekho] Starting frontend on port 5173...
cd /d "%~dp0frontend"
start "Dekho Frontend" cmd /k "npm run dev"

echo.
echo [Dekho] Servers starting (backend takes ~20s for FAISS to load)...
echo   Backend:  http://127.0.0.1:8000
echo   ML Svc:   http://127.0.0.1:8001
echo   Frontend: http://localhost:5173
echo.
echo Waiting 25 seconds for backend to fully start...
ping 127.0.0.1 -n 26 >nul
start http://localhost:5173
