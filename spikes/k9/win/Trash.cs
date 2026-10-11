// K9b 候选的“随包小工具”：用 SHFileOperation 或 IFileOperation 把路径送进回收站。
// 在 CI 运行器上用 .NET Framework 自带的 csc.exe 编译，不需要 SDK。
// 用法：trash.exe sh|ifo <flags 十六进制> <路径>
// 退出码：0 成功；2 外壳报错（输出 HRESULT/错误码）；3 参数错误
using System;
using System.Runtime.InteropServices;

static class T {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHFILEOPSTRUCT {
        public IntPtr hwnd; public uint wFunc;
        [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
        [MarshalAs(UnmanagedType.LPWStr)] public string pTo;
        public ushort fFlags; public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszProgressTitle;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHFileOperation(ref SHFILEOPSTRUCT op);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, [In] ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItem item);

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
        void GetAttributes(uint mask, out uint attrs);
        void Compare(IShellItem psi, uint hint, out int order);
    }
    // 方法顺序必须和系统的虚函数表一致
    [ComImport, Guid("947aab5f-0a5c-4c13-b4d6-4bf7836fc9f8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOperation {
        uint Advise(IntPtr sink); void Unadvise(uint cookie);
        void SetOperationFlags(uint flags);
        void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string msg);
        void SetProgressDialog(IntPtr dlg); void SetProperties(IntPtr props); void SetOwnerWindow(uint hwnd);
        void ApplyPropertiesToItem(IShellItem item); void ApplyPropertiesToItems(IntPtr items);
        void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
        void MoveItem(IShellItem item, IShellItem dest, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void MoveItems(IntPtr items, IShellItem dest);
        void CopyItem(IShellItem item, IShellItem dest, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void CopyItems(IntPtr items, IShellItem dest);
        void DeleteItem(IShellItem item, IntPtr sink); void DeleteItems(IntPtr items);
        uint NewItem(IShellItem dest, uint attr, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string tmpl, IntPtr sink);
        void PerformOperations();
        [return: MarshalAs(UnmanagedType.Bool)] bool GetAnyOperationsAborted();
    }

    [STAThread]
    static int Main(string[] a) {
        if (a.Length != 3) { Console.Error.WriteLine("usage: trash.exe sh|ifo <flagsHex> <path>"); return 3; }
        uint flags = Convert.ToUInt32(a[1], 16);
        string path = a[2];
        try {
            if (a[0] == "sh") {
                var op = new SHFILEOPSTRUCT { wFunc = 3 /* FO_DELETE */, pFrom = path + "\0", fFlags = (ushort)flags };
                int rc = SHFileOperation(ref op);
                Console.WriteLine("sh rc=0x" + rc.ToString("x") + " aborted=" + op.fAnyOperationsAborted);
                return rc == 0 && !op.fAnyOperationsAborted ? 0 : 2;
            } else {
                var clsid = new Guid("3ad05575-8857-4850-9277-11b85bdb8e09");
                var fo = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
                fo.SetOperationFlags(flags);
                var iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
                IShellItem item;
                SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
                fo.DeleteItem(item, IntPtr.Zero);
                fo.PerformOperations();
                bool aborted = fo.GetAnyOperationsAborted();
                Console.WriteLine("ifo ok aborted=" + aborted);
                return aborted ? 2 : 0;
            }
        } catch (Exception e) {
            Console.WriteLine("EXC " + e.GetType().Name + " hr=0x" + (Marshal.GetHRForException(e)).ToString("x") + " " + e.Message.Replace("\n", " "));
            return 2;
        }
    }
}
