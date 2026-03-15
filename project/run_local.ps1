$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$python = "d:/Major/.venv/Scripts/python.exe"
if (-not (Test-Path $python)) {
  Write-Host "Python environment not found at $python"
  exit 1
}

Write-Host "Installing dependencies..."
& $python -m pip install -r requirements.txt | Out-Host

Write-Host "Training model..."
Set-Location "$PSScriptRoot/backend"
& $python train_model.py | Out-Host

Write-Host "Starting FastAPI server on http://127.0.0.1:8000 ..."
& $python -m uvicorn api:app --host 127.0.0.1 --port 8000
