### A. 起停（cycle）

| 运行器 | 环境 | 办法 | 次数 | 启动失败 | 有残留的次数 | 升级为强杀 | 端口可重绑 ms 中位 / p95 / 最大 | 超过 3 秒 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| static | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 19 / 21 | 0 |
| static | ubuntu | group | 50 | 0 | 0 | 0 | 15 / 16 / 16 | 0 |
| static | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 75 / 91 / 91 | 0 |
| static | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 74 / 77 / 77 | 0 |
| static | windows-2025 | job | 50 | 0 | 0 | 0 | 26 / 28 / 29 | 0 |
| static | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 27 / 33 / 33 | 0 |
| static | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 25 / 28 / 28 | 0 |
| static-inproc | macos-26 | inproc | 50 | 0 | 0 | 0 | 0 / 1 / 1 | 0 |
| static-inproc | ubuntu | inproc | 50 | 0 | 0 | 0 | 0 / 0 / 0 | 0 |
| static-inproc | windows-2025 | inproc | 100 | 0 | 0 | 0 | 1 / 2 / 2 | 0 |
| vite | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| vite | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 19 / 24 | 0 |
| vite | ubuntu | group | 50 | 0 | 0 | 0 | 15 / 16 / 16 | 0 |
| vite | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 86 / 98 / 106 | 0 |
| vite | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 83 / 88 / 88 | 0 |
| vite | windows-2025 | job | 50 | 0 | 0 | 0 | 27 / 31 / 32 | 0 |
| vite | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 19 / 84 / 84 | 0 |
| vite | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 19 / 21 / 21 | 0 |
| next | 本机 Mac | group | 50 | 0 | 0 | 0 | 15 / 16 / 16 | 0 |
| next | macos-26 | group | 50 | 0 | 0 | 0 | 17 / 27 / 42 | 0 |
| next | ubuntu | group | 50 | 0 | 0 | 0 | 15 / 16 / 17 | 0 |
| next | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 69 / 89 / 95 | 0 |
| next | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 71 / 86 / 86 | 0 |
| next | windows-2025 | job | 50 | 0 | 0 | 0 | 22 / 30 / 33 | 0 |
| next | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 21 / 32 / 32 | 0 |
| next | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 22 / 30 / 30 | 0 |
| nuxt4 | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| nuxt4 | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 23 / 73 | 0 |
| nuxt4 | ubuntu | group | 50 | 0 | 0 | 0 | 16 / 16 / 17 | 0 |
| nuxt4 | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 59 / 76 / 123 | 0 |
| nuxt4 | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 65 / 81 / 81 | 0 |
| nuxt4 | windows-2025 | job | 50 | 0 | 0 | 0 | 22 / 31 / 33 | 0 |
| nuxt4 | windows-2025 | job-ctrlc | 15 | 0 | 0 | 5 | 18 / 30 / 30 | 0 |
| nuxt4 | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 29 / 32 / 32 | 0 |
| nuxt3 | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| nuxt3 | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 29 / 36 | 0 |
| nuxt3 | ubuntu | group | 50 | 0 | 0 | 0 | 16 / 16 / 19 | 0 |
| nuxt3 | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 70 / 89 / 92 | 0 |
| nuxt3 | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 71 / 82 / 82 | 0 |
| nuxt3 | windows-2025 | job | 50 | 0 | 0 | 0 | 25 / 32 / 33 | 0 |
| nuxt3 | windows-2025 | job-ctrlc | 15 | 0 | 0 | 1 | 25 / 31 / 31 | 0 |
| nuxt3 | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 17 / 25 / 25 | 0 |
| node-ts | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 18 | 0 |
| node-ts | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 18 / 18 | 0 |
| node-ts | ubuntu | group | 50 | 0 | 0 | 0 | 15 / 16 / 16 | 0 |
| node-ts | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 74 / 91 / 91 | 0 |
| node-ts | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 61 / 75 / 75 | 0 |
| node-ts | windows-2025 | job | 50 | 0 | 0 | 0 | 28 / 30 / 30 | 0 |
| node-ts | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 28 / 30 / 30 | 0 |
| node-ts | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 28 / 28 / 28 | 0 |
| python | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| python | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 17 / 18 | 0 |
| python | ubuntu | group | 50 | 0 | 0 | 0 | 16 / 16 / 16 | 0 |
| python | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 62 / 80 / 80 | 0 |
| python | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 62 / 79 / 79 | 0 |
| python | windows-2025 | job | 50 | 0 | 0 | 0 | 26 / 31 / 31 | 0 |
| python | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 517 / 534 / 534 | 0 |
| python | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 523 / 528 / 528 | 0 |
| go | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| go | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 18 / 18 | 0 |
| go | ubuntu | group | 50 | 0 | 0 | 0 | 16 / 18 / 18 | 0 |
| go | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 63 / 79 / 95 | 0 |
| go | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 63 / 72 / 72 | 0 |
| go | windows-2025 | job | 50 | 0 | 0 | 0 | 31 / 32 / 32 | 0 |
| go | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 23 / 31 / 31 | 0 |
| go | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 31 / 31 / 31 | 0 |
| hono | 本机 Mac | group | 50 | 0 | 0 | 0 | 16 / 17 / 17 | 0 |
| hono | macos-26 | group | 50 | 0 | 0 | 0 | 16 / 20 / 48 | 0 |
| hono | ubuntu | group | 50 | 0 | 0 | 0 | 15 / 16 / 18 | 0 |
| hono | windows-2025 | taskkill | 50 | 0 | 0 | 0 | 59 / 88 / 89 | 0 |
| hono | windows-2025 | taskkill-obs | 15 | 0 | 0 | 0 | 65 / 87 / 87 | 0 |
| hono | windows-2025 | job | 50 | 0 | 0 | 0 | 26 / 29 / 30 | 0 |
| hono | windows-2025 | job-ctrlc | 15 | 0 | 0 | 0 | 24 / 29 / 29 | 0 |
| hono | windows-2025 | pty-ctrlc | 5 | 0 | 0 | 0 | 27 / 29 / 29 | 0 |

### B. 其他场景（每格：次数；有残留；端口最大 ms；超 3 秒）

| 运行器 | 环境 | 办法 | inflight | startup-stop | kill | interrupt | install-stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| static | 本机 Mac | group | 5；0；17；0 | 5；0；17；0 | 10；0；17；0 | 10；0；17；0 | — |
| static | macos-26 | group | 5；0；19；0 | 5；0；16；0 | 10；0；19；0 | 10；0；17；0 | — |
| static | ubuntu | group | 5；0；16；0 | 5；0；16；0 | 10；0；16；0 | 10；0；16；0 | — |
| static | windows-2025 | taskkill | 5；0；97；0 | 5；0；65；0 | — | — | — |
| static | windows-2025 | taskkill-obs | 3；0；86；0 | — | — | — | — |
| static | windows-2025 | job | 5；0；23；0 | 5；0；17；0 | — | — | — |
| static | windows-2025 | job-ctrlc | 3；0；20；0 | — | — | — | — |
| static | windows-2025 | pty-ctrlc | 3；0；30；0 | — | — | — | — |
| vite | 本机 Mac | group | 5；0；17；0 | 5；0；16；0 | 10；0；17；0 | 10；0；16；0 | 3；0；0；0 |
| vite | macos-26 | group | 5；0；18；0 | 5；0；17；0 | 10；0；24；0 | 10；0；22；0 | 3；0；0；0 |
| vite | ubuntu | group | 5；0；16；0 | 5；0；15；0 | 10；0；17；0 | 10；0；16；0 | 3；0；0；0 |
| vite | windows-2025 | taskkill | 5；0；68；0 | 5；0；66；0 | — | — | 3；0；5；0 |
| vite | windows-2025 | taskkill-obs | 3；0；74；0 | — | — | — | — |
| vite | windows-2025 | job | 5；0；32；0 | 5；0；17；0 | — | — | 3；0；2；0 |
| vite | windows-2025 | job-ctrlc | 3；0；32；0 | — | — | — | — |
| vite | windows-2025 | pty-ctrlc | 3；0；17；0 | — | — | — | — |
| next | 本机 Mac | group | 5；0；16；0 | 5；0；49；0 | 10；0；17；0 | 10；0；16；0 | 3；0；0；0 |
| next | macos-26 | group | 5；0；25；0 | 5；0；17；0 | 10；0；22；0 | 10；0；23；0 | 3；0；1；0 |
| next | ubuntu | group | 5；0；16；0 | 5；0；17；0 | 10；0；32；0 | 10；0；16；0 | 3；0；0；0 |
| next | windows-2025 | taskkill | 5；0；81；0 | 5；0；79；0 | — | — | 3；0；6；0 |
| next | windows-2025 | taskkill-obs | 3；0；70；0 | — | — | — | — |
| next | windows-2025 | job | 5；0；33；0 | 5；0；28；0 | — | — | 3；0；2；0 |
| next | windows-2025 | job-ctrlc | 3；0；25；0 | — | — | — | — |
| next | windows-2025 | pty-ctrlc | 3；0；21；0 | — | — | — | — |
| nuxt4 | 本机 Mac | group | 5；0；16；0 | 5；0；33；0 | 10；0；17；0 | 10；0；17；0 | 3；0；0；0 |
| nuxt4 | macos-26 | group | 5；0；30；0 | 5；0；99；0 | 10；0；23；0 | 10；0；17；0 | 3；0；0；0 |
| nuxt4 | ubuntu | group | 5；0；16；0 | 5；0；139；0 | 10；0；62；0 | 10；0；16；0 | 3；0；0；0 |
| nuxt4 | windows-2025 | taskkill | 5；0；79；0 | 5；0；80；0 | — | — | 3；0；6；0 |
| nuxt4 | windows-2025 | taskkill-obs | 3；0；70；0 | — | — | — | — |
| nuxt4 | windows-2025 | job | 5；0；19；0 | 5；0；18；0 | — | — | 3；0；3；0 |
| nuxt4 | windows-2025 | job-ctrlc | 3；0；19；0 | — | — | — | — |
| nuxt4 | windows-2025 | pty-ctrlc | 3；0；23；0 | — | — | — | — |
| nuxt3 | 本机 Mac | group | 5；0；16；0 | 5；0；16；0 | 10；0；18；0 | 10；0；16；0 | 3；0；0；0 |
| nuxt3 | macos-26 | group | 5；0；19；0 | 5；0；45；0 | 10；0；28；0 | 10；0；17；0 | 3；0；0；0 |
| nuxt3 | ubuntu | group | 5；0；16；0 | 5；0；233；0 | 10；0；51；0 | 10；0；16；0 | 3；0；0；0 |
| nuxt3 | windows-2025 | taskkill | 5；0；86；0 | 5；0；111；0 | — | — | 3；0；13；0 |
| nuxt3 | windows-2025 | taskkill-obs | 3；0；81；0 | — | — | — | — |
| nuxt3 | windows-2025 | job | 5；0；19；0 | 5；0；32；0 | — | — | 3；0；6；0 |
| nuxt3 | windows-2025 | job-ctrlc | 3；0；18；0 | — | — | — | — |
| nuxt3 | windows-2025 | pty-ctrlc | 3；0；18；0 | — | — | — | — |
| node-ts | 本机 Mac | group | 5；0；16；0 | 5；0；17；0 | 10；0；17；0 | 10；0；17；0 | — |
| node-ts | macos-26 | group | 5；0；17；0 | 5；0；3；0 | 10；0；17；0 | 10；0；27；0 | — |
| node-ts | ubuntu | group | 5；0；16；0 | 5；0；15；0 | 10；0；16；0 | 10；0；16；0 | — |
| node-ts | windows-2025 | taskkill | 5；0；95；0 | 5；0；82；0 | — | — | — |
| node-ts | windows-2025 | taskkill-obs | 3；0；96；0 | — | — | — | — |
| node-ts | windows-2025 | job | 5；0；25；0 | 5；0；17；0 | — | — | — |
| node-ts | windows-2025 | job-ctrlc | 3；0；32；0 | — | — | — | — |
| node-ts | windows-2025 | pty-ctrlc | 3；0；27；0 | — | — | — | — |
| python | 本机 Mac | group | 5；0；17；0 | 5；0；16；0 | 10；0；16；0 | 10；0；16；0 | — |
| python | macos-26 | group | 5；0；17；0 | 5；0；17；0 | 10；0；17；0 | 10；0；19；0 | — |
| python | ubuntu | group | 5；0；16；0 | 5；0；16；0 | 10；0；16；0 | 10；0；30；0 | — |
| python | windows-2025 | taskkill | 5；0；83；0 | 5；0；65；0 | — | — | — |
| python | windows-2025 | taskkill-obs | 3；0；65；0 | — | — | — | — |
| python | windows-2025 | job | 5；0；30；0 | 5；0；1；0 | — | — | — |
| python | windows-2025 | job-ctrlc | 3；0；234；0 | — | — | — | — |
| python | windows-2025 | pty-ctrlc | 3；0；230；0 | — | — | — | — |
| go | 本机 Mac | group | 5；0；17；0 | 5；0；17；0 | 10；0；17；0 | 10；0；17；0 | — |
| go | macos-26 | group | 5；0；18；0 | 5；0；17；0 | 10；0；19；0 | 10；0；18；0 | — |
| go | ubuntu | group | 5；0；16；0 | 5；0；17；0 | 10；0；18；0 | 10；0；18；0 | — |
| go | windows-2025 | taskkill | 5；0；80；0 | 5；0；65；0 | — | — | — |
| go | windows-2025 | taskkill-obs | 3；0；80；0 | — | — | — | — |
| go | windows-2025 | job | 5；0；30；0 | 5；0；28；0 | — | — | — |
| go | windows-2025 | job-ctrlc | 3；0；28；0 | — | — | — | — |
| go | windows-2025 | pty-ctrlc | 3；0；27；0 | — | — | — | — |
| hono | 本机 Mac | group | 5；0；17；0 | 5；0；16；0 | 10；0；17；0 | 10；0；17；0 | 3；0；0；0 |
| hono | macos-26 | group | 5；0；40；0 | 5；0；1；0 | 10；0；19；0 | 10；0；45；0 | 3；0；0；0 |
| hono | ubuntu | group | 5；0；16；0 | 5；0；0；0 | 10；0；17；0 | 10；0；16；0 | 3；0；0；0 |
| hono | windows-2025 | taskkill | 5；0；90；0 | 5；0；65；0 | — | — | 3；0；6；0 |
| hono | windows-2025 | taskkill-obs | 3；0；86；0 | — | — | — | — |
| hono | windows-2025 | job | 5；0；26；0 | 5；0；16；0 | — | — | 3；0；2；0 |
| hono | windows-2025 | job-ctrlc | 3；0；33；0 | — | — | — | — |
| hono | windows-2025 | pty-ctrlc | 3；0；28；0 | — | — | — | — |

### C. 停止之后的下一次启动

| 运行器 | 环境 | 办法 | 启动中途停止后再启动 | 强制结束后再启动 | 安装中途停止后：原样重装成功 / 之后启动成功 |
| --- | --- | --- | --- | --- | --- |
| static | 本机 Mac | group | 5/5 | 10/10 | — |
| static | macos-26 | group | 5/5 | 10/10 | — |
| static | ubuntu | group | 5/5 | 10/10 | — |
| static | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | — |
| static | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | — |
| vite | 本机 Mac | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| vite | macos-26 | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| vite | ubuntu | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| vite | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| vite | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| next | 本机 Mac | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| next | macos-26 | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| next | ubuntu | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| next | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| next | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| nuxt4 | 本机 Mac | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt4 | macos-26 | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt4 | ubuntu | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt4 | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| nuxt4 | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| nuxt3 | 本机 Mac | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt3 | macos-26 | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt3 | ubuntu | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| nuxt3 | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| nuxt3 | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| node-ts | 本机 Mac | group | 5/5 | 10/10 | — |
| node-ts | macos-26 | group | 5/5 | 10/10 | — |
| node-ts | ubuntu | group | 5/5 | 10/10 | — |
| node-ts | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | — |
| node-ts | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | — |
| python | 本机 Mac | group | 5/5 | 10/10 | — |
| python | macos-26 | group | 5/5 | 10/10 | — |
| python | ubuntu | group | 5/5 | 10/10 | — |
| python | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | — |
| python | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | — |
| go | 本机 Mac | group | 5/5 | 10/10 | — |
| go | macos-26 | group | 5/5 | 10/10 | — |
| go | ubuntu | group | 5/5 | 10/10 | — |
| go | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | — |
| go | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | — |
| hono | 本机 Mac | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| hono | macos-26 | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| hono | ubuntu | group | 5/5 | 10/10 | 3/3 ； 3/3 |
| hono | windows-2025 | taskkill | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |
| hono | windows-2025 | job | 5/5 | 49/49（每次起停都是强制结束） | 3/3 ； 3/3 |

### D. 退出码

| 运行器 | 环境 | 办法 | 场景 | 退出码或信号 × 次数 |
| --- | --- | --- | --- | --- |
| static | 本机 Mac | group | cycle | SIGTERM×50 |
| static | 本机 Mac | group | kill | SIGKILL×10 |
| static | 本机 Mac | group | interrupt | SIGINT×10 |
| vite | 本机 Mac | group | cycle | 143×50 |
| vite | 本机 Mac | group | kill | SIGKILL×10 |
| vite | 本机 Mac | group | interrupt | SIGINT×10 |
| next | 本机 Mac | group | cycle | 0×50 |
| next | 本机 Mac | group | kill | SIGKILL×10 |
| next | 本机 Mac | group | interrupt | 0×10 |
| nuxt4 | 本机 Mac | group | cycle | 0×50 |
| nuxt4 | 本机 Mac | group | kill | SIGKILL×10 |
| nuxt4 | 本机 Mac | group | interrupt | 0×10 |
| nuxt3 | 本机 Mac | group | cycle | 0×50 |
| nuxt3 | 本机 Mac | group | kill | SIGKILL×10 |
| nuxt3 | 本机 Mac | group | interrupt | 0×10 |
| node-ts | 本机 Mac | group | cycle | SIGTERM×50 |
| node-ts | 本机 Mac | group | kill | SIGKILL×10 |
| node-ts | 本机 Mac | group | interrupt | SIGINT×10 |
| python | 本机 Mac | group | cycle | SIGTERM×50 |
| python | 本机 Mac | group | kill | SIGKILL×10 |
| python | 本机 Mac | group | interrupt | SIGINT×10 |
| go | 本机 Mac | group | cycle | SIGTERM×50 |
| go | 本机 Mac | group | kill | SIGKILL×10 |
| go | 本机 Mac | group | interrupt | 1×10 |
| hono | 本机 Mac | group | cycle | SIGTERM×50 |
| hono | 本机 Mac | group | kill | SIGKILL×10 |
| hono | 本机 Mac | group | interrupt | SIGINT×10 |
| static | windows-2025 | taskkill | cycle | 1×50 |
| static | windows-2025 | taskkill-obs | cycle | 1×15 |
| node-ts | windows-2025 | taskkill | cycle | 1×50 |
| node-ts | windows-2025 | taskkill-obs | cycle | 1×15 |
| python | windows-2025 | taskkill | cycle | 1×50 |
| python | windows-2025 | taskkill-obs | cycle | 1×15 |
| go | windows-2025 | taskkill | cycle | 1×50 |
| go | windows-2025 | taskkill-obs | cycle | 1×15 |
| hono | windows-2025 | taskkill | cycle | 1×50 |
| hono | windows-2025 | taskkill-obs | cycle | 1×15 |
| static | windows-2025 | job | cycle | SIGTERM×50 |
| static | windows-2025 | job-ctrlc | cycle | 3221225786×15 |
| static | windows-2025 | pty-ctrlc | cycle | -1073741510×5 |
| node-ts | windows-2025 | job | cycle | SIGTERM×50 |
| node-ts | windows-2025 | job-ctrlc | cycle | 3221225786×15 |
| node-ts | windows-2025 | pty-ctrlc | cycle | -1073741510×5 |
| python | windows-2025 | job | cycle | SIGTERM×50 |
| python | windows-2025 | job-ctrlc | cycle | 3221225786×15 |
| python | windows-2025 | pty-ctrlc | cycle | -1073741510×5 |
| go | windows-2025 | job | cycle | SIGTERM×50 |
| go | windows-2025 | job-ctrlc | cycle | 1×15 |
| go | windows-2025 | pty-ctrlc | cycle | 1×5 |
| hono | windows-2025 | job | cycle | SIGTERM×50 |
| hono | windows-2025 | job-ctrlc | cycle | 3221225786×15 |
| hono | windows-2025 | pty-ctrlc | cycle | -1073741510×5 |
| next | windows-2025 | taskkill | cycle | 1×50 |
| next | windows-2025 | taskkill-obs | cycle | 1×15 |
| next | windows-2025 | job | cycle | SIGTERM×50 |
| next | windows-2025 | job-ctrlc | cycle | 0×15 |
| next | windows-2025 | pty-ctrlc | cycle | 0×5 |
| nuxt3 | windows-2025 | taskkill | cycle | 1×50 |
| nuxt3 | windows-2025 | taskkill-obs | cycle | 1×15 |
| nuxt3 | windows-2025 | job | cycle | SIGTERM×50 |
| nuxt3 | windows-2025 | job-ctrlc | cycle | 137×1 0×14 |
| nuxt3 | windows-2025 | pty-ctrlc | cycle | 0×5 |
| nuxt4 | windows-2025 | taskkill | cycle | 1×50 |
| nuxt4 | windows-2025 | taskkill-obs | cycle | 1×15 |
| nuxt4 | windows-2025 | job | cycle | SIGTERM×50 |
| nuxt4 | windows-2025 | job-ctrlc | cycle | 137×5 0×10 |
| nuxt4 | windows-2025 | pty-ctrlc | cycle | 0×5 |
| vite | windows-2025 | taskkill | cycle | 1×50 |
| vite | windows-2025 | taskkill-obs | cycle | 1×15 |
| vite | windows-2025 | job | cycle | SIGTERM×50 |
| vite | windows-2025 | job-ctrlc | cycle | 1×15 |
| vite | windows-2025 | pty-ctrlc | cycle | 1×5 |

### E. 就绪耗时 ms（中位 / 最大，cycle）

| 运行器 | 环境 | 办法 | 就绪 ms 中位 / 最大 | 就绪时最多进程数 |
| --- | --- | --- | --- | --- |
| static | 本机 Mac | group | 64 / 66 | 1 |
| static | macos-26 | group | 127 / 135 | 1 |
| static | ubuntu | group | 65 / 124 | 1 |
| static | windows-2025 | taskkill | 131 / 163 | 2 |
| static | windows-2025 | job | 134 / 155 | 3 |
| vite | 本机 Mac | group | 132 / 697 | 1 |
| vite | macos-26 | group | 295 / 787 | 1 |
| vite | ubuntu | group | 262 / 272 | 1 |
| vite | windows-2025 | taskkill | 412 / 499 | 2 |
| vite | windows-2025 | job | 278 / 428 | 3 |
| next | 本机 Mac | group | 970 / 2386 | 2 |
| next | macos-26 | group | 3212 / 6993 | 2 |
| next | ubuntu | group | 1789 / 2216 | 2 |
| next | windows-2025 | taskkill | 2905 / 3321 | 3 |
| next | windows-2025 | job | 2978 / 3061 | 4 |
| nuxt4 | 本机 Mac | group | 1865 / 2627 | 4 |
| nuxt4 | macos-26 | group | 3511 / 5520 | 4 |
| nuxt4 | ubuntu | group | 3542 / 3976 | 4 |
| nuxt4 | windows-2025 | taskkill | 4636 / 5223 | 5 |
| nuxt4 | windows-2025 | job | 6002 / 6597 | 6 |
| nuxt3 | 本机 Mac | group | 1881 / 2624 | 4 |
| nuxt3 | macos-26 | group | 3432 / 5342 | 4 |
| nuxt3 | ubuntu | group | 3550 / 4216 | 4 |
| nuxt3 | windows-2025 | taskkill | 6284 / 7165 | 5 |
| nuxt3 | windows-2025 | job | 6502 / 6831 | 6 |
| node-ts | 本机 Mac | group | 64 / 65 | 1 |
| node-ts | macos-26 | group | 127 / 265 | 1 |
| node-ts | ubuntu | group | 126 / 132 | 1 |
| node-ts | windows-2025 | taskkill | 196 / 578 | 2 |
| node-ts | windows-2025 | job | 136 / 141 | 3 |
| python | 本机 Mac | group | 63 / 64 | 1 |
| python | macos-26 | group | 125 / 390 | 1 |
| python | ubuntu | group | 62 / 121 | 1 |
| python | windows-2025 | taskkill | 130 / 141 | 2 |
| python | windows-2025 | job | 65 / 137 | 3 |
| go | 本机 Mac | group | 124 / 3520 | 9 |
| go | macos-26 | group | 124 / 13864 | 4 |
| go | ubuntu | group | 122 / 15842 | 10 |
| go | windows-2025 | taskkill | 375 / 22848 | 6 |
| go | windows-2025 | job | 252 / 16668 | 7 |
| hono | 本机 Mac | group | 127 / 129 | 1 |
| hono | macos-26 | group | 130 / 207 | 1 |
| hono | ubuntu | group | 128 / 188 | 1 |
| hono | windows-2025 | taskkill | 199 / 211 | 2 |
| hono | windows-2025 | job | 136 / 146 | 3 |
