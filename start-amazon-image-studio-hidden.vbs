Set shell = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & projectDir & "\start-amazon-image-studio-hidden.bat" & """", 0, False
