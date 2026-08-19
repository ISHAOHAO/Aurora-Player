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
  ${NSD_CreateLabel} 0 28u 100% 24u "是否将常见视频文件类型绑定到 Aurora Player？$\n取消勾选则安装后不会修改任何系统文件关联。"
  Pop $0
  ${NSD_CreateCheckbox} 0 56u 100% 12u "关联视频文件（.mp4 .mkv .avi .mov .flv .wmv .webm .ts .m2ts .mpeg .mpg）"
  Pop $AssocCheckbox
  ${NSD_SetState} $AssocCheckbox ${BST_CHECKED}
  nsDialogs::Show
FunctionEnd

Function AssocPageLeave
  ${NSD_GetState} $AssocCheckbox $AssocChecked
FunctionEnd

; 安装段：用户勾选后才注册
!macro customInstall
  ${If} $AssocChecked == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\AuroraPlayer.Video\DefaultIcon" "" "$INSTDIR\Aurora Player.exe,0"
    WriteRegStr HKCU "Software\Classes\AuroraPlayer.Video\shell\open\command" "" ' "$INSTDIR\Aurora Player.exe" "%1"'

    WriteRegStr HKCU "Software\Classes\.mp4" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.mkv" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.avi" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.mov" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.flv" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.wmv" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.webm" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.ts" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.m2ts" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.mpeg" "" "AuroraPlayer.Video"
    WriteRegStr HKCU "Software\Classes\.mpg" "" "AuroraPlayer.Video"
  ${EndIf}
!macroend

; 卸载段：仅清理本程序写入的关联（确认仍指向本 ProgID 才删，避免误删其他程序）
!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.mp4" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.mp4"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mkv" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.mkv"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.avi" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.avi"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mov" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.mov"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.flv" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.flv"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.wmv" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.wmv"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.webm" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.webm"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.ts" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.ts"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.m2ts" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.m2ts"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mpeg" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.mpeg"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mpg" ""
  ${If} $0 == "AuroraPlayer.Video"
    DeleteRegKey HKCU "Software\Classes\.mpg"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\AuroraPlayer.Video"
!macroend
