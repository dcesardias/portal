@echo off
REM Inicia o Kanban de Chamados (Tasy HML)
cd /d "%~dp0backend"
echo Iniciando Kanban de Chamados em http://localhost:8000 ...
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
