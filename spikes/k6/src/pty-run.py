#!/usr/bin/env python3
"""在真正的伪终端里启动一个交互登录 shell，喂入命令，收集输出。
用途：作为"终端用户实际拿到什么"的对照（ground truth）。伪终端保证 shell 像在 Terminal.app 里一样：
有控制终端、会画提示符、会跑 precmd/chpwd 钩子。
用法：pty-run.py <cwd> <timeout秒> <shell> [shell参数...]   命令从 stdin 读入，以 EOF 结束。"""
import os, pty, sys, time, select, signal

cwd, timeout, argv = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
script = sys.stdin.read()
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvp(argv[0], argv)
out = bytearray()

def pump(dur):
    end = time.time() + dur
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try:
                d = os.read(fd, 65536)
            except OSError:
                return False
            if not d:
                return False
            out.extend(d)
    return True

def wait_quiet(quiet=0.4, maxwait=8.0):
    # 等 shell 启动完（输出安静 quiet 秒）。慢启动文件靠 maxwait 兜底
    t0 = last = time.time()
    n = len(out)
    while time.time() - t0 < maxwait:
        pump(0.05)
        if len(out) != n:
            n = len(out); last = time.time()
        elif time.time() - last > quiet and n > 0:
            return
try:
    deadline = time.time() + timeout
    wait_quiet()
    for line in script.splitlines():
        os.write(fd, (line + "\n").encode())
        pump(0.25)  # 让提示符/钩子在两条命令之间有机会运行
    os.write(fd, b"exit\n")
    while time.time() < deadline:
        if not pump(0.2):
            break
finally:
    try: os.kill(pid, signal.SIGKILL)
    except Exception: pass
    try: os.waitpid(pid, 0)
    except Exception: pass
sys.stdout.buffer.write(bytes(out))
