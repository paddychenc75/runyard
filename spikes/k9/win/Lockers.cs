// 用 Restart Manager 查“哪些进程占着这些文件”。输入：一个文本文件，每行一个绝对路径。
// 输出：每行 pid<TAB>应用名。Restart Manager 只认文件句柄/加载的模块，不认“进程的当前目录”。
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Diagnostics;

static class L {
    [StructLayout(LayoutKind.Sequential)] struct RM_UNIQUE_PROCESS { public int dwProcessId; public FILETIME ProcessStartTime; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct RM_PROCESS_INFO {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
        public int ApplicationType; public uint AppStatus; public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, string key);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, IntPtr apps, uint nSvc, string[] svc);
    [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint count, [In, Out] RM_PROCESS_INFO[] info, ref uint reasons);

    // ---- 模式 cwd：读每个进程的 PEB，取“当前目录”，列出当前目录在给定目录之内的进程（仅 x64） ----
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, byte[] info, int len, out int ret);

    static string CwdOf(int pid) {
        IntPtr h = OpenProcess(0x0400 | 0x0010, false, pid); // QUERY_INFORMATION | VM_READ
        if (h == IntPtr.Zero) return null;
        try {
            var pbi = new byte[48]; int ret;
            if (NtQueryInformationProcess(h, 0, pbi, 48, out ret) != 0) return null;
            long peb = BitConverter.ToInt64(pbi, 8);
            var b8 = new byte[8]; IntPtr rd;
            if (!ReadProcessMemory(h, (IntPtr)(peb + 0x20), b8, (IntPtr)8, out rd)) return null;
            long pars = BitConverter.ToInt64(b8, 0);
            var us = new byte[16];
            if (!ReadProcessMemory(h, (IntPtr)(pars + 0x38), us, (IntPtr)16, out rd)) return null;
            int len = BitConverter.ToUInt16(us, 0); long buf = BitConverter.ToInt64(us, 8);
            if (len <= 0 || len > 65000) return null;
            var sb = new byte[len];
            if (!ReadProcessMemory(h, (IntPtr)buf, sb, (IntPtr)len, out rd)) return null;
            return System.Text.Encoding.Unicode.GetString(sb);
        } finally { CloseHandle(h); }
    }

    static int Main(string[] a) {
        if (a[0] == "cwd") {
            string dir = a[1].TrimEnd('\\').ToLowerInvariant();
            foreach (var p in Process.GetProcesses()) {
                string c = null;
                try { c = CwdOf(p.Id); } catch { }
                if (c != null && c.TrimEnd('\\').ToLowerInvariant().StartsWith(dir)) Console.WriteLine(p.Id + "\t" + p.ProcessName + "\t" + c);
            }
            return 0;
        }
        var files = File.ReadAllLines(a[0]);
        uint h; string key = Guid.NewGuid().ToString();
        int rc = RmStartSession(out h, 0, key);
        if (rc != 0) { Console.WriteLine("ERR start " + rc); return 2; }
        try {
            rc = RmRegisterResources(h, (uint)files.Length, files, 0, IntPtr.Zero, 0, null);
            if (rc != 0) { Console.WriteLine("ERR register " + rc); return 2; }
            uint needed = 0, count = 0, reasons = 0;
            rc = RmGetList(h, out needed, ref count, null, ref reasons);
            if (rc == 0 && needed == 0) return 0;
            if (rc != 234 && rc != 0) { Console.WriteLine("ERR getlist1 " + rc); return 2; }
            var info = new RM_PROCESS_INFO[needed]; count = needed;
            rc = RmGetList(h, out needed, ref count, info, ref reasons);
            if (rc != 0) { Console.WriteLine("ERR getlist2 " + rc); return 2; }
            for (int i = 0; i < count; i++) Console.WriteLine(info[i].Process.dwProcessId + "\t" + info[i].strAppName);
            return 0;
        } finally { RmEndSession(h); }
    }
}
