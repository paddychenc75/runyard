# Python 探针：子命令与 prog.ts / main.go 一致。
# 注意：这里故意不写任何 flush / encoding 设置——要测的是工具“默认”会怎样。
import os
import sys
import time

cmd = sys.argv[1] if len(sys.argv) > 1 else "hello"
a = int(sys.argv[2]) if len(sys.argv) > 2 else 6
b_raw = sys.argv[3] if len(sys.argv) > 3 else "50"
b = int(b_raw) if b_raw.isdigit() else 0

if cmd == "hello":
    print("中文测试：你好，世界 ASCII ok")
    print("中文错误输出（stderr）：标准错误", file=sys.stderr)
    print({"名称": "运行场", "n": 1})
    print("stdout.encoding=%s stderr.encoding=%s" % (sys.stdout.encoding, sys.stderr.encoding), file=sys.stderr)
elif cmd == "symbols":
    print("symbols ✓ ✗ → … 😀 ▲ ⨯")
elif cmd == "error":
    print("before error 中文测试")
    def inner():
        raise ValueError("中文错误：出错了")
    inner()
elif cmd == "progress":
    for i in range(6):
        sys.stdout.write("\r进度 %d%%" % (i * 20))
        sys.stdout.flush()
        time.sleep(0.03)
    sys.stdout.write("\n完成\n")
elif cmd == "tick":
    for i in range(1, a + 1):
        print("tick %d %d 中文" % (i, int(time.time() * 1000)))
        time.sleep(1)
elif cmd == "interleave":
    for i in range(1, a + 1):
        print("seq %d %s" % (i, "out" if i % 2 else "err"), file=sys.stdout if i % 2 else sys.stderr)
        if b > 0:
            time.sleep(b / 1000)
elif cmd == "bulk":
    # 大量带颜色码的中文行；b_raw=hard 时写完立刻 os._exit（不经过解释器收尾，不刷新缓冲）
    for i in range(1, a + 1):
        print("\x1b[32mbulk %d 中文测试\x1b[0m 末尾" % i)
    if b_raw == "hard":
        os._exit(0)
elif cmd == "hang":
    for i in range(1, a + 1):
        print("line %d before-kill 中文" % i)
    time.sleep(60)
