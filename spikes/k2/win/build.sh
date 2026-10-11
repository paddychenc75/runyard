#!/usr/bin/env bash
# 在 Windows 的 CI 机器上把 runyard-job.c 编译成 runyard-job.exe，用镜像里现成的编译器，不装任何东西。
# 依次试 gcc（MinGW-w64）、clang、MSVC 的 cl；打印用了哪个、产物大小和 SHA-256。
set -euo pipefail
cd "$(dirname "$0")"
rm -f runyard-job.exe
if command -v gcc >/dev/null 2>&1; then
  echo "compiler: $(gcc --version | head -1)"
  gcc -O2 -s -Wall -o runyard-job.exe runyard-job.c
elif command -v clang >/dev/null 2>&1; then
  echo "compiler: $(clang --version | head -1)"
  clang -O2 -Wall -o runyard-job.exe runyard-job.c
else
  vsroot="$("/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe" -latest -property installationPath)"
  echo "compiler: MSVC at $vsroot"
  cmd.exe //c "call \"$vsroot\\VC\\Auxiliary\\Build\\vcvars64.bat\" && cl /nologo /O2 /W3 runyard-job.c /Fe:runyard-job.exe"
fi
ls -l runyard-job.exe
sha256sum runyard-job.exe
# 看它依赖哪些 DLL：产品版本不应该依赖编译器自带的运行库
if command -v objdump >/dev/null 2>&1; then objdump -p runyard-job.exe | grep "DLL Name" || true; fi
