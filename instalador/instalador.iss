[Setup]
AppName=Disparador Pro
AppVersion=1.0.0
AppPublisher=VST - Estoque WhatsApp
AppId={{7A4D2E96-1B3C-4F58-9E77-DISPARADORPRO}
DefaultDirName={localappdata}\DisparadorPro
DefaultGroupName=Disparador Pro
UninstallDisplayName=Disparador Pro
UninstallDisplayIcon={app}\app.ico
Compression=lzma2/max
SolidCompression=yes
OutputDir=C:\Users\Owner\Desktop
OutputBaseFilename=DisparadorPro-Setup
SetupIconFile=C:\Users\Owner\Documents\Default Project\DisparadorPro\app.ico
PrivilegesRequired=lowest
WizardStyle=modern
DisableProgramGroupPage=yes

[Files]
Source: "C:\Users\Owner\Documents\Default Project\DisparadorPro\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{userdesktop}\Disparador Pro"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{group}\Disparador Pro"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{group}\Parar Disparador Pro"; Filename: "{app}\parar-dashboard.bat"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"

[Run]
Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent; Description: "Abrir o Disparador Pro"
