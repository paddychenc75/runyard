// runyard-job.exe（K2 验证用的最小版本）：建一个 Job Object，在里面启动目标命令，等它结束。
// 形态按技术设计 §7.2 表后的说明：独立的可执行文件，不是 Node 模块。
//
// 用法：runyard-job.exe [--observe] [--console] [--stdin-control] -- <目标命令行，原样交给 CreateProcess>
//   （默认）          Job 带 KILL_ON_JOB_CLOSE：本程序退出或被结束时，Job 里的进程全部结束。
//   --observe         只为验证用：Job 不带“关闭即杀”，根进程退出后每 10 毫秒看一次 Job 里还剩几个进程，
//                     写进报告。用它给 taskkill /T /F 打分（Job 的成员表是权威的，孤儿也逃不掉）。
//   --console         本程序另开一个自己的控制台，目标进程树都挂在这个控制台上，
//                     这样才能只对这棵树发 Ctrl+C，不波及调用方。
//   --stdin-control   从标准输入读指令：ctrlc（发 Ctrl+C）、kill（结束整个 Job）；读到末尾（调用方没了）也结束整个 Job。
// 报告：环境变量 RUNYARD_JOB_REPORT 指向的文件，每行 key=value。
// 退出码：目标命令的退出码；自身出错是 120 以上。
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

static HANDLE g_job = NULL;
static BOOL g_own_console = FALSE;
static wchar_t g_report[1024];

static void report(const char *key, long long value) {
  FILE *f;
  if (!g_report[0]) return;
  f = _wfopen(g_report, L"a");
  if (!f) return;
  fprintf(f, "%s=%lld\n", key, value);
  fclose(f);
}

static DWORD job_active(void) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
  if (!QueryInformationJobObject(g_job, JobObjectBasicAccountingInformation, &info, sizeof info, NULL)) return 0;
  return info.ActiveProcesses;
}

// 自己不因 Ctrl+C 退出。处理函数不会被子进程继承，子进程照常收到。
static BOOL WINAPI on_ctrl(DWORD type) {
  return type == CTRL_C_EVENT || type == CTRL_BREAK_EVENT;
}

static DWORD WINAPI control_thread(LPVOID arg) {
  HANDLE in = (HANDLE)arg;
  char buf[64];
  DWORD n;
  for (;;) {
    if (!ReadFile(in, buf, sizeof buf - 1, &n, NULL) || n == 0) {
      // 调用方关了管道或者已经不在了：不留孤儿
      TerminateJobObject(g_job, 137);
      return 0;
    }
    buf[n] = 0;
    if (strstr(buf, "ctrlc")) {
      // 只有确实拿到了自己的控制台才发：否则 Ctrl+C 会落到调用方所在的控制台上
      if (g_own_console) {
        report("ctrlcSent", GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0) ? 1 : 0);
      } else {
        report("ctrlcSent", -1);
      }
    } else if (strstr(buf, "kill")) {
      TerminateJobObject(g_job, 137);
    }
  }
}

int main(void) {
  wchar_t *cl = GetCommandLineW();
  wchar_t *sep = wcsstr(cl, L" -- ");
  wchar_t head[2048];
  wchar_t *target;
  size_t headLen;
  BOOL observe, console, stdinControl;
  HANDLE hIn, hOut, hErr, hNul;
  SECURITY_ATTRIBUTES sa;
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  DWORD code = 0, active, waited = 0, limit;

  if (!sep) {
    fprintf(stderr, "usage: runyard-job [--observe] [--console] [--stdin-control] -- <command line>\n");
    return 120;
  }
  headLen = (size_t)(sep - cl);
  if (headLen >= 2048) headLen = 2047;
  wcsncpy(head, cl, headLen);
  head[headLen] = 0;
  observe = wcsstr(head, L"--observe") != NULL;
  console = wcsstr(head, L"--console") != NULL;
  stdinControl = wcsstr(head, L"--stdin-control") != NULL;
  target = _wcsdup(sep + 4);
  g_report[0] = 0;
  GetEnvironmentVariableW(L"RUNYARD_JOB_REPORT", g_report, 1024);

  // 先记下调用方给的三个标准句柄（管道）：换控制台之后还要原样交给目标进程
  hIn = GetStdHandle(STD_INPUT_HANDLE);
  hOut = GetStdHandle(STD_OUTPUT_HANDLE);
  hErr = GetStdHandle(STD_ERROR_HANDLE);

  if (console) {
    FreeConsole();
    g_own_console = AllocConsole();
    report("ownConsole", g_own_console ? 1 : 0);
    SetStdHandle(STD_INPUT_HANDLE, hIn);
    SetStdHandle(STD_OUTPUT_HANDLE, hOut);
    SetStdHandle(STD_ERROR_HANDLE, hErr);
    // “忽略 Ctrl+C”是会从父进程继承下来的属性：调用方若是被别人用“新进程组”方式启动的（CI 的执行器就是），
    // 这棵树上人人都忽略 Ctrl+C。第一轮实验里正因为这样，Ctrl+C 发出去了却没人理。这里先清掉，再装自己的处理函数。
    SetConsoleCtrlHandler(NULL, FALSE);
    SetConsoleCtrlHandler(on_ctrl, TRUE);
  }

  g_job = CreateJobObjectW(NULL, NULL); // 句柄默认不可继承：子进程拿不到它，“最后一个句柄”始终在本程序手里
  if (!g_job) return 121;
  if (!observe) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    ZeroMemory(&limits, sizeof limits);
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(g_job, JobObjectExtendedLimitInformation, &limits, sizeof limits)) return 122;
  }

  // 目标进程的标准输入给空设备；控制用的管道不让它继承
  ZeroMemory(&sa, sizeof sa);
  sa.nLength = sizeof sa;
  sa.bInheritHandle = TRUE;
  hNul = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, NULL);
  if (hIn && hIn != INVALID_HANDLE_VALUE) SetHandleInformation(hIn, HANDLE_FLAG_INHERIT, 0);

  ZeroMemory(&si, sizeof si);
  si.cb = sizeof si;
  si.dwFlags = STARTF_USESTDHANDLES;
  si.hStdInput = hNul;
  si.hStdOutput = hOut;
  si.hStdError = hErr;
  // 先挂起再放进 Job，免得它在进 Job 之前就生出子进程
  if (!CreateProcessW(NULL, target, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &si, &pi)) {
    fprintf(stderr, "runyard-job: CreateProcess failed: %lu\n", GetLastError());
    return 123;
  }
  if (!AssignProcessToJobObject(g_job, pi.hProcess)) {
    fprintf(stderr, "runyard-job: AssignProcessToJobObject failed: %lu\n", GetLastError());
    TerminateProcess(pi.hProcess, 124);
    return 124;
  }
  report("child", (long long)pi.dwProcessId);
  ResumeThread(pi.hThread);
  CloseHandle(pi.hThread);
  if (stdinControl) CreateThread(NULL, 0, control_thread, hIn, 0, NULL);

  WaitForSingleObject(pi.hProcess, INFINITE);
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess);

  // 根进程退出了。看 Job 里还剩谁、多久走光。
  active = job_active();
  report("rootExitCode", (long long)code);
  report("activeAtRootExit", (long long)active);
  limit = observe ? 10000 : 2000;
  while (active > 0 && waited < limit) {
    Sleep(10);
    waited += 10;
    active = job_active();
  }
  report("msUntilEmpty", active == 0 ? (long long)waited : -1);
  report("leftover", (long long)active);
  if (active > 0) TerminateJobObject(g_job, 137); // 不留下任何东西（验证时这也是清理）
  CloseHandle(g_job);
  return (int)code;
}
