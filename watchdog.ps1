$PORTA = 3000
$PASTA = "C:\Users\Owner\Documents\Default Project\whatsapp-envio"
$arquivoFalhas = Join-Path $PASTA "vigia-falhas.txt"
$registroVigia = Join-Path $PASTA "vigia-log.txt"

function Registrar($msg) {
  try { Add-Content $registroVigia ("[" + (Get-Date -Format "dd/MM HH:mm:ss") + "] " + $msg) -ErrorAction SilentlyContinue } catch {}
}

$mutex = New-Object System.Threading.Mutex($false, "DisparadorVigia")
$got = $false
try { $got = $mutex.WaitOne(0) } catch {
  # mutex abandonado por um vigia morto: seguimos, o servidor tem guardas proprias
  Registrar "mutex abandonado - assumindo"
  $got = $true
}
if (-not $got) { Registrar "outro vigia em execucao"; exit 0 }

try {
  try {
    Invoke-RestMethod "http://localhost:$PORTA/api/estado" -TimeoutSec 4 | Out-Null
    Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
    Registrar "OK - sistema vivo"
    exit 0
  } catch {
    Registrar "HTTP falhou"
  }

  # primeira falha: pode ser engasgo momentaneo - proximo ciclo confirma
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

  Registrar ("matando: " + (($alvos | Select-Object -Unique) -join ', '))
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
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$PASTA`" && `"$env:ProgramFiles\nodejs\node.exe`" server.js > node-out.log 2>&1" -WindowStyle Hidden
    Registrar "subi nova instancia"
  } else {
    Registrar "porta ainda ocupada - NAO subi nada"
  }
  Set-Content $arquivoFalhas '0' -ErrorAction SilentlyContinue
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch {}
  $mutex.Dispose()
}
