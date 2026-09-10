Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Owner\Documents\Default Project\whatsapp-envio"
sh.Run """C:\Program Files\nodejs\node.exe"" server.js", 0, False
WScript.Sleep 4000
sh.Run "cmd /c start http://localhost:3000", 0, False
