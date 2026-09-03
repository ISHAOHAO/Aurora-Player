; Aurora Player — 自定义 NSIS 安装脚本
; 通过 package.json 的 nsis.include 注入；
; 此 include 位于 MUI2/nsDialogs 之后、assistedInstaller 之前，故 ${NSD_*} 宏可用。
;
; 功能：
;  1) 文件关联勾选页（顶层 Page custom）—— 用户可选择是否将视频文件绑定到本程序
;  2) 安装段（customInstall）按勾选结果写 HKCU\Software\Classes 注册表
;  3) 卸载段（customUnInstall）清理这些注册表项
;
; 说明：安装作用域为 per-user（package.json nsis.perMachine=false），
;       故注册表写 HKCU，无需管理员权限、不触发 UAC。

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var AssocCheckbox
Var AssocChecked

; 文件关联勾选页（顺序在欢迎页之前，功能可用；用户可勾选/取消）
Page custom AssocPageCreate AssocPageLeave

Function AssocPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 28u 100% 24u "是否将 Aurora Player 添加到视频文件的打开方式？$\n取消勾选则安装后不会修改任何系统文件关联。"
  Pop $0
  ${NSD_CreateCheckbox} 0 56u 100% 12u "添加打开方式（.mp4 .mkv .avi .mov .flv .wmv .webm .ts .m2ts .mpeg .mpg）"
  Pop $AssocCheckbox
  ReadRegStr $AssocChecked HKCU "Software\Aurora Player" "OpenWith"
  ${If} $AssocChecked == ""
    StrCpy $AssocChecked ${BST_CHECKED}
  ${EndIf}
  ${NSD_SetState} $AssocCheckbox $AssocChecked
  nsDialogs::Show
FunctionEnd

Function AssocPageLeave
  ${NSD_GetState} $AssocCheckbox $AssocChecked
FunctionEnd


; Only values owned by Aurora are added/removed. Never delete extension keys.
!macro RegisterVideoExtension EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "AuroraPlayer.Video" ""
!macroend
!macro RemoveVideoExtension EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "AuroraPlayer.Video"
  ; Migrate legacy installs which overwrote the extension default; keep all other values/subkeys.
  ReadRegStr $0 HKCU "Software\Classes\${EXT}" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegValue HKCU "Software\Classes\${EXT}" ""
  ${EndIf}
!macroend
!macro customInstall
  ${If} $AssocChecked == ""
    ReadRegStr $AssocChecked HKCU "Software\Aurora Player" "OpenWith"
  ${EndIf}
  ${If} $AssocChecked == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Aurora Player" "OpenWith" "$AssocChecked"
    WriteRegStr HKCU "Software\Classes\AuroraPlayer.Video\DefaultIcon" "" "$INSTDIR\Aurora Player.exe,0"
    WriteRegStr HKCU "Software\Classes\AuroraPlayer.Video\shell\open\command" "" '"$INSTDIR\Aurora Player.exe" "%1"'
    !insertmacro RegisterVideoExtension ".mp4"
    !insertmacro RegisterVideoExtension ".mkv"
    !insertmacro RegisterVideoExtension ".avi"
    !insertmacro RegisterVideoExtension ".mov"
    !insertmacro RegisterVideoExtension ".flv"
    !insertmacro RegisterVideoExtension ".wmv"
    !insertmacro RegisterVideoExtension ".webm"
    !insertmacro RegisterVideoExtension ".ts"
    !insertmacro RegisterVideoExtension ".m2ts"
    !insertmacro RegisterVideoExtension ".mpeg"
    !insertmacro RegisterVideoExtension ".mpg"
  ${Else}
    WriteRegStr HKCU "Software\Aurora Player" "OpenWith" "0"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
!macro customUnInstall
  ${IfNot} ${isUpdated}
  !insertmacro RemoveVideoExtension ".mp4"
  !insertmacro RemoveVideoExtension ".mkv"
  !insertmacro RemoveVideoExtension ".avi"
  !insertmacro RemoveVideoExtension ".mov"
  !insertmacro RemoveVideoExtension ".flv"
  !insertmacro RemoveVideoExtension ".wmv"
  !insertmacro RemoveVideoExtension ".webm"
  !insertmacro RemoveVideoExtension ".ts"
  !insertmacro RemoveVideoExtension ".m2ts"
  !insertmacro RemoveVideoExtension ".mpeg"
  !insertmacro RemoveVideoExtension ".mpg"
  DeleteRegKey HKCU "Software\Classes\AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Aurora Player" "OpenWith"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
