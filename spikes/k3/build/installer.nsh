; K3 的 NSIS 钩子（electron-builder 26.17.0 的模板会在几个固定位置展开这里定义的宏）。
; 变体在编译时由环境变量 K3_NSIS_VARIANT 决定：
;   hook     本文建议的做法：先调用内置命令行请管理进程退出，再走打包工具原来的检查
;   default  不定义 customCheckAppRunning：打包工具自己的做法（按安装目录找进程，直接结束）
;   nocheck  把检查整个关掉：对照，看“没人管管理进程”时安装器会怎样
!define K3_VARIANT "$%K3_NSIS_VARIANT%"
!define K3_HOOK_LOG "$TEMP\runyard-k3-installer-hook.log"

!macro k3Log TEXT
  FileOpen $9 "${K3_HOOK_LOG}" a
  FileSeek $9 0 END
  FileWrite $9 "${TEXT}$\r$\n"
  FileClose $9
!macroend

!if "${K3_VARIANT}" == "hook"
  ; 模板只在没有 customCheckAppRunning 时才引入这两样，我们还要用它原来的检查，所以自己引入
  !include "getProcessInfo.nsh"
  Var pid

  ; 安装（含覆盖安装）和卸载开始时都会展开这个宏：安装器和卸载器是同一份脚本编出来的
  !macro customCheckAppRunning
    ${if} ${FileExists} "$INSTDIR\bin\runyard.cmd"
      ; 第 1 步：请管理进程自己退出（它会先停掉所有运行）。最多等 5 秒，还活着就按进程号结束（脚本里核对身份）
      nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /C ""$INSTDIR\bin\runyard.cmd" installer-stop --reason install"'
      Pop $0
      Pop $1
      !insertmacro k3Log "installer-stop exit=$0 out=$1"
    ${else}
      !insertmacro k3Log "installer-stop skipped: no previous install at $INSTDIR"
    ${endif}
    ; 第 2 步：打包工具原来的检查，处理应用窗口本身和任何漏网的进程
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
  !macroend
!else if "${K3_VARIANT}" == "nocheck"
  !macro customCheckAppRunning
    !insertmacro k3Log "check skipped (nocheck variant)"
  !macroend
!endif

; 安装完成后：登记链接协议。electron-builder 的 NSIS 目标不会替我们登记（protocols 配置只管 macOS 和 Linux）
!macro customInstall
  WriteRegStr HKCU "Software\Classes\runyard-k3" "" "URL:Runyard K3 spike"
  WriteRegStr HKCU "Software\Classes\runyard-k3" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\runyard-k3\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro k3Log "customInstall done at $INSTDIR"
!macroend

; 卸载时、删文件之前：把 bin 从用户 PATH 里拿掉，删链接协议。覆盖安装会先跑旧版的卸载器（带 --updated），那时不能删
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /C ""$INSTDIR\bin\runyard.cmd" path-remove"'
    Pop $0
    Pop $1
    !insertmacro k3Log "path-remove exit=$0 out=$1"
    DeleteRegKey HKCU "Software\Classes\runyard-k3"
    ; 安装器在 %LOCALAPPDATA% 下建的更新缓存目录，模板的卸载不会删（第一轮 CI 里留了下来）
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
  ${else}
    !insertmacro k3Log "customUnInstall: updated, keep PATH and protocol"
  ${endif}
!macroend
