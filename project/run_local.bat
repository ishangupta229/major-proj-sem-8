@echo off
setlocal

cd /d %~dp0
set PYTHON_EXE=d:/Major/.venv/Scripts/python.exe

if not exist "%PYTHON_EXE%" (
  echo Python environment not found at %PYTHON_EXE%
  exit /b 1
)

echo Installing dependencies...
"%PYTHON_EXE%" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo Training model...
cd backend
"%PYTHON_EXE%" train_model.py
if errorlevel 1 exit /b 1

echo Starting FastAPI server on http://127.0.0.1:8000 ...
"%PYTHON_EXE%" -m uvicorn api:app --host 127.0.0.1 --port 8000
