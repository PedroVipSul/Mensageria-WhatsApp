@echo off
chcp 65001 >nul
echo Encerrando o disparador...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Pronto, servidor encerrado.
pause
