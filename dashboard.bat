@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" http://localhost:3000
echo ============================================
echo   DASHBOARD DISPONIVEL: http://localhost:3000
echo   Deixe esta janela aberta enquanto usa!
echo ============================================
"C:\Program Files\nodejs\node.exe" server.js
pause
