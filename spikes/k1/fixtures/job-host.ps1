# 模拟“把子进程放进关闭即杀的分组里的终端”（VS Code 终端、某些智能体的 shell 可能这样做）：
# 本进程先把自己放进一个 Job Object，再在里面运行给定的脚本，然后一直等着。
# 测试程序随后强杀本进程：Job 的最后一个句柄关闭，带 KILL_ON_JOB_CLOSE 时系统会结束 Job 里的所有进程。
param([string]$Script, [uint32]$LimitFlags, [string]$StatusFile)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class K1Job {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public IoCounters Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  public static string Enter(uint flags) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) return "create-failed:" + Marshal.GetLastWin32Error();
    Extended e = new Extended();
    e.Basic.LimitFlags = flags;
    int length = Marshal.SizeOf(typeof(Extended));
    IntPtr p = Marshal.AllocHGlobal(length);
    Marshal.StructureToPtr(e, p, false);
    // 9 = JobObjectExtendedLimitInformation
    if (!SetInformationJobObject(job, 9, p, (uint)length)) return "set-failed:" + Marshal.GetLastWin32Error();
    if (!AssignProcessToJobObject(job, GetCurrentProcess())) return "assign-failed:" + Marshal.GetLastWin32Error();
    return "ok";
  }
}
"@

$entered = [K1Job]::Enter($LimitFlags)
& cmd.exe /d /c $Script
Set-Content -Path $StatusFile -Value ("{0} script-exit={1}" -f $entered, $LASTEXITCODE)
Start-Sleep -Seconds 120
