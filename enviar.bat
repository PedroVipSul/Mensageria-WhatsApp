@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Iniciando envio em massa...
"C:\Program Files\nodejs\node.exe" enviar.js
echo.
pause
