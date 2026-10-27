$mutex = New-Object System.Threading.Mutex($false, "DisparadorVigia")
$got = $false
try { $got = $mutex.WaitOne(0) } catch { exit 0 }
if (-not $got) { exit 0 }

try {
  try {
    Invoke-RestMethod "http://localhost:3000/api/estado" -TimeoutSec 4 | Out-Null
    exit 0
  } catch {}

  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep 1
    $restam = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' })
    if ($restam.Count -eq 0) { break }
  }

  $restam2 = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' })
  if ($restam2.Count -eq 0) {
    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" -WorkingDirectory "C:\Users\Owner\Documents\Default Project\whatsapp-envio" -WindowStyle Hidden
  }
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch {}
  $mutex.Dispose()
}
