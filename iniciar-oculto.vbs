Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta

node = pasta & "\node.exe"
If Not fso.FileExists(node) Then node = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
sh.Run """" & node & """ server.js", 0, False
WScript.Sleep 5000

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
