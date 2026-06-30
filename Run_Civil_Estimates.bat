@echo off
title Civil Estimates - Floor Plan Detector v3.0
color 0B
echo.
echo  ============================================
echo     Civil Estimates - AI Floor Plan Analysis
echo            Final Year Project v3.0
echo  ============================================
echo.

REM ── Step 1: Check Python ────────────────────────────
echo  [1/4] Checking Python...
python --version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo        [ERROR] Python is not installed or not in PATH.
    echo        Please install Python from https://python.org
    pause
    exit /b 1
)
echo        Python found.
echo.

REM ── Step 2: Install dependencies ────────────────────
echo  [2/4] Checking dependencies...
cd /d "%~dp0backend"
python -c "import fastapi, uvicorn, ultralytics, fitz, cv2, numpy, PIL, openpyxl" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo        Dependencies are already installed. Skipping install step.
) else (
    echo        Some dependencies are missing. Installing...
    pip install -r requirements.txt
    if %ERRORLEVEL% NEQ 0 (
        echo        [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo        Dependencies installed successfully.
)
echo.

REM ── Step 3: Check model file ────────────────────────
echo  [3/4] Checking YOLO model...
if not exist "%~dp0best.pt" (
    echo        [ERROR] Model file best.pt not found in project root.
    echo        Please place your trained model file as best.pt
    pause
    exit /b 1
)
echo        Model found.
echo.

REM ── Step 4: Start server and open browser ───────────
echo  [4/4] Starting web server...
echo.
echo  ============================================
echo     Everything is ready! Opening browser...
echo  ============================================
echo.
echo  Features:
echo    - YOLO door/window/wall detection
echo    - Numbered detections with confidence legend
echo    - Cost estimation (Pakistan market rates)
echo    - PDF text removal for clean analysis
echo    - Excel report export
echo    - Optimised wall detection (fast region growing)
echo.

REM Open browser after a short delay to let the server start
cd /d "%~dp0backend"
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000"

echo  Server running at: http://127.0.0.1:8000
echo  Press Ctrl+C to stop the server.
echo.

python -m uvicorn main:app --host 127.0.0.1 --port 8000

echo.
echo Server stopped. You can close this window.
pause
