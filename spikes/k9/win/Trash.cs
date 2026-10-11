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

    // 进度回调接口：外壳在真正删除前调用 PreDeleteItem，并告诉我们“会不会进回收站”。
    // 若不会（dwFlags 不含 TSF_DELETE_RECYCLE_IF_POSSIBLE），返回失败即可中止，文件夹原样保留。
    [ComImport, Guid("04b0f1a7-9490-44bc-96e1-4296a31252e2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOperationProgressSink {
        void StartOperations(); void FinishOperations(uint hr);
        void PreRenameItem(uint f, IShellItem i, [MarshalAs(UnmanagedType.LPWStr)] string n);
        void PostRenameItem(uint f, IShellItem i, [MarshalAs(UnmanagedType.LPWStr)] string n, uint hr, IShellItem nw);
        void PreMoveItem(uint f, IShellItem i, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n);
        void PostMoveItem(uint f, IShellItem i, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n, uint hr, IShellItem nw);
        void PreCopyItem(uint f, IShellItem i, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n);
        void PostCopyItem(uint f, IShellItem i, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n, uint hr, IShellItem nw);
        void PreDeleteItem(uint f, IShellItem i);
        void PostDeleteItem(uint f, IShellItem i, uint hr, IShellItem nw);
        void PreNewItem(uint f, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n);
        void PostNewItem(uint f, IShellItem d, [MarshalAs(UnmanagedType.LPWStr)] string n, [MarshalAs(UnmanagedType.LPWStr)] string t, uint attr, uint hr, IShellItem ni);
        void UpdateProgress(uint total, uint sofar);
        void ResetTimer(); void PauseTimer(); void ResumeTimer();
    }
    [ClassInterface(ClassInterfaceType.None)]
    class Sink : IFileOperationProgressSink {
        public static string Log = "";
        public void StartOperations() {} public void FinishOperations(uint hr) {}
        public void PreRenameItem(uint f, IShellItem i, string n) {}
        public void PostRenameItem(uint f, IShellItem i, string n, uint hr, IShellItem nw) {}
        public void PreMoveItem(uint f, IShellItem i, IShellItem d, string n) {}
        public void PostMoveItem(uint f, IShellItem i, IShellItem d, string n, uint hr, IShellItem nw) {}
        public void PreCopyItem(uint f, IShellItem i, IShellItem d, string n) {}
        public void PostCopyItem(uint f, IShellItem i, IShellItem d, string n, uint hr, IShellItem nw) {}
        public void PreDeleteItem(uint f, IShellItem i) {
            Log += "pre(flags=0x" + f.ToString("x") + ") ";
            if ((f & 0x80) == 0) throw new COMException("不会进回收站，中止", unchecked((int)0x80004005));
        }
        public void PostDeleteItem(uint f, IShellItem i, uint hr, IShellItem nw) { Log += "post(hr=0x" + hr.ToString("x") + ",recycled=" + (nw != null) + ") "; }
        public void PreNewItem(uint f, IShellItem d, string n) {} public void PostNewItem(uint f, IShellItem d, string n, string t, uint attr, uint hr, IShellItem ni) {}
        public void UpdateProgress(uint total, uint sofar) {} public void ResetTimer() {} public void PauseTimer() {} public void ResumeTimer() {}
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
                bool useSink = a[0] == "ifos";
                var clsid = new Guid("3ad05575-8857-4850-9277-11b85bdb8e09");
                var fo = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
                fo.SetOperationFlags(flags);
                var iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
                IShellItem item;
                SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
                uint cookie = 0;
                if (useSink) cookie = fo.Advise(Marshal.GetComInterfaceForObject(new Sink(), typeof(IFileOperationProgressSink)));
                fo.DeleteItem(item, IntPtr.Zero);
                fo.PerformOperations();
                bool aborted = fo.GetAnyOperationsAborted();
                Console.WriteLine("ifo ok aborted=" + aborted + (useSink ? " sink: " + Sink.Log : ""));
                return aborted ? 2 : 0;
            }
        } catch (Exception e) {
            Console.WriteLine("EXC " + e.GetType().Name + " hr=0x" + (Marshal.GetHRForException(e)).ToString("x") + " " + e.Message.Replace("\n", " "));
            return 2;
        }
    }
}
