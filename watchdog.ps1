$mutex = New-Object System.Threading.Mutex($false, "DisparadorVigia")
$got = $false
try { $got = $mutex.WaitOne(0) } catch { exit 0 }
if (-not $got) { exit 0 }

$PORTA = 3000
$PASTA = "C:\Users\Owner\Documents\Default Project\whatsapp-envio"
$arquivoFalhas = Join-Path $PASTA "vigia-falhas.txt"
$registroVigia = Join-Path $PASTA "vigia-log.txt"

function Registrar($msg) {
  try { Add-Content $registroVigia ("[" + (Get-Date -Format "dd/MM HH:mm:ss") + "] " + $msg) -ErrorAction SilentlyContinue } catch {}
}

try {
  try {
    Invoke-RestMethod "http://localhost:$PORTA/api/estado" -TimeoutSec 4 | Out-Null
    Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
    Registrar "OK - sistema vivo"
    exit 0
  } catch {
    Registrar "HTTP falhou: " + $_.Exception.Message
  }

  $falhas = 0
  if (Test-Path $arquivoFalhas) { try { $falhas = [int](Get-Content $arquivoFalhas -First 1) } catch {} }
  if ($falhas -lt 1) {
    Set-Content $arquivoFalhas '1' -ErrorAction SilentlyContinue
    Registrar "falha 1 de 2 - aguardando proximo ciclo"
    exit 0
  }
  Registrar "falha 2 de 2 - INICIANDO RESGATE"

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
    Registrar "subi nova instancia"
  } else {
    Registrar "porta ainda ocupada - NAO subi nada"
  }
  Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch {}
  $mutex.Dispose()
}
