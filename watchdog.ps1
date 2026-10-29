$mutex = New-Object System.Threading.Mutex($false, "DisparadorVigia")
$got = $false
try { $got = $mutex.WaitOne(0) } catch { exit 0 }
if (-not $got) { exit 0 }

$PORTA = 3000
$PASTA = "C:\Users\Owner\Documents\Default Project\whatsapp-envio"
$arquivoFalhas = Join-Path $PASTA "vigia-falhas.txt"

try {
  try {
    Invoke-RestMethod "http://localhost:$PORTA/api/estado" -TimeoutSec 4 | Out-Null
    Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
    exit 0
  } catch {}

  # 1a falha: pode ser engasgo momentaneo — espera o proximo ciclo confirmar
  $falhas = 0
  if (Test-Path $arquivoFalhas) { try { $falhas = [int](Get-Content $arquivoFalhas -First 1) } catch {} }
  if ($falhas -lt 1) {
    Set-Content $arquivoFalhas '1' -ErrorAction SilentlyContinue
    exit 0
  }

  # 2a falha seguida: resgate de verdade
  $alvos = @(Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty OwningProcess -Unique)
  $alvos += @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
              Where-Object { $_.CommandLine -like '*server.js*' } |
              Select-Object -ExpandProperty ProcessId)

  foreach ($p in ($alvos | Select-Object -Unique)) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
  }

  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep 1
    $portLivre = @(Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction SilentlyContinue).Count -eq 0
    $semNode = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' }).Count -eq 0
    if ($portLivre -and $semNode) { break }
  }

  $portLivre2 = @(Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction SilentlyContinue).Count -eq 0
  if ($portLivre2) {
    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" -WorkingDirectory $PASTA -WindowStyle Hidden
  }
  Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch {}
  $mutex.Dispose()
}
