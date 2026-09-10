@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Listando suas etiquetas do WhatsApp...
"C:\Program Files\nodejs\node.exe" enviar.js --etiquetas
echo.
pause
