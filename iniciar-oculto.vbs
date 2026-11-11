Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta

' verifica se o servidor ja esta no ar antes de religar
jaRodando = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://localhost:3000/api/estado", False
http.send
If Err.Number = 0 And http.Status = 200 Then jaRodando = True
Err.Clear
On Error GoTo 0

' segunda checagem: batimento do servidor.lock (nao depende de proxy/rede)
If Not jaRodando Then
  If fso.FileExists(pasta & "\servidor.lock") Then
    Set lockFile = fso.GetFile(pasta & "\servidor.lock")
    segundos = DateDiff("s", lockFile.DateLastModified, Now)
    If segundos < 60 And segundos > -120 Then jaRodando = True
  End If
End If

If Not jaRodando Then
  node = pasta & "\node.exe"
  If Not fso.FileExists(node) Then node = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
  sh.Run """" & node & """ server.js", 0, False
  WScript.Sleep 5000
End If

chrome = ""
candidatos = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe" _
)
For Each c In candidatos
  If fso.FileExists(c) Then chrome = c
Next

If chrome <> "" Then
  sh.Run """" & chrome & """ --app=http://localhost:3000 --window-size=1150,950", 1, False
Else
  sh.Run "cmd /c start http://localhost:3000", 0, False
End If
