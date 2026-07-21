!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"          # 新增，用于 ${RunningX64}

# 定义文件名（两个架构）
!define VC_REDIST_X86 "vc_redist.x86.exe"
!define VC_REDIST_X64 "vc_redist.x64.exe"
!define KB2999226_X86 "Windows6.1-KB2999226-x86.msu"
!define KB2999226_X64 "Windows6.1-KB2999226-x64.msu"

# 定义注册表子键（根键统一为 HKLM）
!define VC_SUBKEY_X86 "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86"
!define VC_SUBKEY_X64 "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
!define KB_SUBKEY     "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Hotfix\KB2999226"

# 检查并安装 VC++ Redist
Function InstallVCRedist
  ${If} ${RunningX64}
    ClearErrors
    ReadRegDWORD $0 HKLM "${VC_SUBKEY_X64}" "Installed"   # 修正：显式指定 HKLM 和子键
    ${If} ${Errors}
      DetailPrint "正在安装 Visual C++ Redistributable (x64)..."
      ExecWait '"$EXEDIR\${VC_REDIST_X64}" /install /quiet /norestart' $1
      ${If} $1 != 0
        DetailPrint "VC++ x64 安装失败，错误码: $1"
      ${Else}
        DetailPrint "VC++ x64 安装成功"
      ${EndIf}
    ${Else}
      ${If} $0 == 0
        DetailPrint "正在安装 Visual C++ Redistributable (x64)..."
        ExecWait '"$EXEDIR\${VC_REDIST_X64}" /install /quiet /norestart' $1
      ${Else}
        DetailPrint "VC++ x64 已安装，跳过"
      ${EndIf}
    ${EndIf}
  ${Else}
    ClearErrors
    ReadRegDWORD $0 HKLM "${VC_SUBKEY_X86}" "Installed"   # 修正
    ${If} ${Errors}
      DetailPrint "正在安装 Visual C++ Redistributable (x86)..."
      ExecWait '"$EXEDIR\${VC_REDIST_X86}" /install /quiet /norestart' $1
      ${If} $1 != 0
        DetailPrint "VC++ x86 安装失败，错误码: $1"
      ${Else}
        DetailPrint "VC++ x86 安装成功"
      ${EndIf}
    ${Else}
      ${If} $0 == 0
        DetailPrint "正在安装 Visual C++ Redistributable (x86)..."
        ExecWait '"$EXEDIR\${VC_REDIST_X86}" /install /quiet /norestart' $1
      ${Else}
        DetailPrint "VC++ x86 已安装，跳过"
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

# 检查并安装 KB2999226
Function InstallKB2999226
  ${If} ${RunningX64}
    ClearErrors
    ReadRegDWORD $0 HKLM "${KB_SUBKEY}" "ThisVersion"   # 修正，不分 x86/x64，路径相同
    ${If} ${Errors}
      DetailPrint "正在安装 KB2999226 (x64)..."
      ExecWait '"$SYSDIR\wusa.exe" "$EXEDIR\${KB2999226_X64}" /quiet /norestart' $1
      ${If} $1 != 0
        DetailPrint "KB2999226 x64 安装失败，错误码: $1"
      ${Else}
        DetailPrint "KB2999226 x64 安装成功"
      ${EndIf}
    ${Else}
      DetailPrint "KB2999226 x64 已安装，跳过"
    ${EndIf}
  ${Else}
    ClearErrors
    ReadRegDWORD $0 HKLM "${KB_SUBKEY}" "ThisVersion"   # 修正
    ${If} ${Errors}
      DetailPrint "正在安装 KB2999226 (x86)..."
      ExecWait '"$SYSDIR\wusa.exe" "$EXEDIR\${KB2999226_X86}" /quiet /norestart' $1
      ${If} $1 != 0
        DetailPrint "KB2999226 x86 安装失败，错误码: $1"
      ${Else}
        DetailPrint "KB2999226 x86 安装成功"
      ${EndIf}
    ${Else}
      DetailPrint "KB2999226 x86 已安装，跳过"
    ${EndIf}
  ${EndIf}
FunctionEnd

# 安装完成后执行
!macro PostInstall
  Call InstallVCRedist
  Call InstallKB2999226
!macroend