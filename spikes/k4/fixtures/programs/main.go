// Go 探针：子命令与 prog.ts / prog.py 一致。用 `go run main.go <子命令>` 运行。
package main

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

func arg(i int, def int) int {
	if len(os.Args) > i {
		if v, err := strconv.Atoi(os.Args[i]); err == nil {
			return v
		}
	}
	return def
}

func main() {
	cmd := "hello"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "hello":
		fmt.Println("中文测试：你好，世界 ASCII ok")
		fmt.Fprintln(os.Stderr, "中文错误输出（stderr）：标准错误")
		fmt.Println(map[string]int{"名称": 1})
	case "symbols":
		fmt.Println("symbols ✓ ✗ → … 😀 ▲ ⨯")
	case "error":
		fmt.Println("before error 中文测试")
		panic("中文错误：出错了")
	case "progress":
		for i := 0; i <= 5; i++ {
			fmt.Printf("\r进度 %d%%", i*20)
			time.Sleep(30 * time.Millisecond)
		}
		fmt.Print("\n完成\n")
	case "tick":
		for i := 1; i <= arg(2, 6); i++ {
			fmt.Printf("tick %d %d 中文\n", i, time.Now().UnixMilli())
			time.Sleep(time.Second)
		}
	case "interleave":
		for i := 1; i <= arg(2, 6); i++ {
			if i%2 == 1 {
				fmt.Fprintf(os.Stdout, "seq %d out\n", i)
			} else {
				fmt.Fprintf(os.Stderr, "seq %d err\n", i)
			}
			if arg(3, 50) > 0 {
				time.Sleep(time.Duration(arg(3, 50)) * time.Millisecond)
			}
		}
	case "hang":
		for i := 1; i <= arg(2, 6); i++ {
			fmt.Printf("line %d before-kill 中文\n", i)
		}
		time.Sleep(60 * time.Second)
	}
}
