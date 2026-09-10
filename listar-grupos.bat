@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Listando seus grupos do WhatsApp...
"C:\Program Files\nodejs\node.exe" enviar.js --listar
echo.
pause
