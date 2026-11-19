param([int]$MeuPid)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*server.js*' -and $_.ProcessId -ne $MeuPid } |
  ForEach-Object { Write-Output ($_.ProcessId.ToString() + '|' + $_.ParentProcessId.ToString() + '|' + $_.CreationDate.ToString('s')) }
