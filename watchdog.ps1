try {
  Invoke-RestMethod "http://localhost:3000/api/estado" -TimeoutSec 4 | Out-Null
  exit 0
} catch {}

Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep 2
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" -WorkingDirectory "C:\Users\Owner\Documents\Default Project\whatsapp-envio" -WindowStyle Hidden
