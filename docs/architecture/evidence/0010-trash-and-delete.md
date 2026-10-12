# 0010 的依据：废纸篓、回收站和改名（K9）

这是决策记录 [0010](../decisions/0010-trash-and-delete.md) 的依据：实验的问题、测量的数字、每条通过标准的判定、采用的算法和没有验证的部分。技术验证 K9 的实验代码已删除，本文自成一体。所有数字来自 K9 的实验结果；两处在实验过程中更正过的结论按更正后的写。

## 1. 问题

- K9a（macOS）：命令行和管理进程是不带原生模块的 Node，也没有 Electron。能不能靠 `rename` 把项目文件夹移进 `~/.Trash`（别的卷用 `.Trashes/<uid>`），不弹权限框、不需要“完全磁盘访问”，Finder 里看得到、拖得回来？
- K9b（Windows）：刚停掉开发服务器的项目能不能马上改名；能不能在不用原生 Node 模块的前提下把它（约三万个文件、超长路径）移进回收站、可还原，并且保证**绝不静默永久删除**？

## 2. 环境

| | 负责人的 Mac | macOS 运行器 | Windows 运行器 |
| --- | --- | --- | --- |
| 系统 | macOS 27.0.1（26A434），arm64 | GitHub `macos-26`，macOS 26.6.2（25G83），arm64 | `windows-2025`，Windows Server 2025 Datacenter 10.0.26100，管理员账号 runneradmin（RID 500） |
| Node | 24.21.0 | 24.21.0 | 24.21.0 |
| 其他 | 从 Claude Code 里运行，终端是 ghostty（TCC 的授权按“负责的应用”算，结论只对这个上下文成立） | 无界面权限预先授权 | Defender 在运行但实时保护、行为监控全关；`LongPathsEnabled=1`；PowerShell 5.1；有交互会话和 explorer |

Windows 运行器是 Server 版加管理员账号，不等于用户的 Windows 11 普通账号：凡与权限、杀毒、长路径开关有关的结论都只是近似。运行器的 `~/.Trash` 可以列目录（没有 TCC 限制），所以“能列”不能当作用户机器的证据。

测试用的假树：约 30,012 个小文件、2,284 个目录，深层嵌套 30 层，4 个符号链接（含两个悬空），三个 8 MB 的大文件，只读文件和只读目录，带扩展属性的文件，隐藏文件，中文和 emoji 名字。

## 3. K9a（macOS）的测量

| 实验 | 次数 | 结果 |
| --- | --- | --- |
| 普通 `node` 对 `~/.Trash` 的权限（负责人的 Mac） | 1 | `stat`、`access(W_OK)` 成功；`mkdir`、`rename` 进去成功；**列目录 `EPERM`**；无弹窗，调用立即返回；能读 `~/.Trash/.DS_Store` |
| 三万个文件 `rename` 进 `~/.Trash` 再 `rename` 回原位 | 每处 5 | Mac：进 0.14 到 0.28 ms，还原 0.08 到 0.14 ms；运行器：进 0.10 到 0.82 ms，还原 0.06 到 0.20 ms。还原后取样 SHA-256、权限、符号链接目标（含悬空）、扩展属性、文件数全部一致 |
| 重名：直接 `rename` 到已有同名**空目录**上 | 各 1 | 静默覆盖；`ENOTEMPTY` 只在目标非空时出现 |
| 重名：先占位再改名 | 各 1 | 同名四次得到 `名字`、`名字 02.09.11`、`名字 02.09.11 2`、`名字 02.09.11 3`；文件得到 `名字 02.09.11.txt`；全程不列目录 |
| 系统自己的重名写法（运行器） | 1 | Finder：`名字 6.17.18 PM`（再重名接 `X`）；`/usr/bin/trash` 和 `trashItem`：`名字 18-17-18-085`（带毫秒）。无法与系统完全一致，唯一即可 |
| 文件夹本身是符号链接 | 各 1 | 移走的是链接本身，目标目录完好 |
| 文件夹正在被使用（进程的当前目录在里面；`tail -f` 打开着里面的文件） | 各 1 | `rename` 成功，两个进程都活着，`lsof` 显示路径变成了废纸篓里的路径 |
| 其他卷：APFS（600 MB）、exFAT 和 FAT（各 300 MB）的磁盘映像 | 各 1（Mac 和运行器） | 三种文件系统上 `<卷>/.Trashes/<uid>` 都能建，进去、回来都成功，校验一致。APFS 上 `.Trashes` 建成 1333 模式；exFAT、FAT 不支持改权限，模式 0700。没有遇到文件系统不支持 `.Trashes` 的情形 |
| 复制后删除兜底（跨卷到 `~/.Trash`） | 各 1 | 三万个文件的 APFS 卷：Mac 7.0 s、运行器 7.1 s；3,000 个文件的 exFAT：Mac 3.5 s、运行器 80 s；FAT：Mac 5.0 s、运行器 111 s（运行器的磁盘映像上小文件极慢）。`fs.cp` 不带扩展属性，只读目录的模式也丢了 |
| 复制失败时（源里放不可读内容） | 各 1 | 源原样保留，废纸篓里没有半成品 |

“放回原处”（Put Back）：系统把原位置写在 `~/.Trash/.DS_Store` 的 `ptbL`/`ptbN` 记录里（在 `.DS_Store` 里找条目名和原父目录的 UTF-16 串，负责人的 Mac 上比对）。`rename` 不写这两项；`/usr/bin/trash`（macOS 15.0 起自带）、`FileManager.trashItem`（Swift 小工具）、npm 包 `trash@10.1.1` 都写；运行器上 Finder（`osascript`）也写。**这是写入证据，不是在 Finder 里点“放回原处”的证据。**

替代实现，三万个文件，Mac：`/usr/bin/trash` 19 ms；自己编译的 Swift 小工具 271 ms（运行器 51 ms，59 KB，`swiftc` 编译 Mac 0.5 s、运行器 10.6 s）；npm `trash` 86 ms；运行器上 Finder（`osascript`）2.96 s，没有弹 Automation 框（预先授权的环境，不能当作用户机器的证据）。全部无弹窗、可还原、保留“放回原处”。

## 4. K9b（Windows）的测量

均在运行器上，1 轮完整加 3 轮针对性补测。

| 实验 | 次数 | 结果 |
| --- | --- | --- |
| 停掉 Vite 8.3.1（`taskkill /T /F` 返回后立刻计时，每 10 ms 重试）后改名 | 30 | 30/30 成功，中位数 1.4 ms，最大 2.1 ms，没有出现任何错误码 |
| 进程当前目录在文件夹里时改名 | 10 | `EBUSY` |
| 别的进程打开了里面的文件（Node 句柄、不共享删除的 PowerShell 句柄都一样） | 各 10 | `EPERM` |
| `fs.watch` 监听子目录 | 10 | `EPERM` |
| `fs.watch` 监听项目文件夹本身 | 10 | 不拦改名 |
| 杀掉占用进程后改名 | 每种 10 | 1.2 到 1.5 ms 内成功（PowerShell 占用后一次 243 ms，监听后一次 19 ms，都是第一轮的离群值） |
| 找出占用者（每种 1 次） | 1 | 读每个进程的 PEB 取当前目录（小工具，41 ms）认得出“当前目录在里面”，其他认不出；PowerShell 查命令行或可执行文件路径含该目录（约 400 ms）认得出命令行带路径的 4 种，认不出当前目录占用；Restart Manager 对单个已知文件认得出持有者（Node、PowerShell），对整棵目录的文件列表返回 `ERROR_ACCESS_DENIED`（5），对监听和程序映像也认不出，失败原因没有查明 |
| 约 3.1 万个文件（4 MB，目录在用户主目录下）进回收站 | 每个候选至少 1，几个候选 3 | 全部进了回收站、可还原（把 `$R…` 改回原位，取样 SHA-256 与文件数一致）。PowerShell `DeleteDirectory(…SendToRecycleBin)` 10.0、10.2、10.5、11.0 s；`Shell.Application` 12.6 到 13.0 s；自带小工具 `SHFileOperation` 9.5 到 10.4 s、`IFileOperation` 9.6 到 11.5 s；npm `trash@10.1.1` 的 `windows-trash.exe` 9.8 到 10.4 s。约 25 次测量中位数 10 s 上下，**贴着 10 s 的线** |
| 启动开销 | 5 | PowerShell 启动到加载好 VB 程序集约 0.31 s；自带小工具空转约 37 ms |
| 单文件分发：6.6 KB 的小工具以 base64 嵌进一个 `.mjs`，运行时写到临时目录再调用 | 1 | 成功进了回收站（嵌入后脚本 9.3 KB，约 0.28 s）。没有试 Node 单可执行文件（SEA）打包 |
| 对照：`fs.rmSync` 直接删除同样约 3 万个文件 | 3 | 7.3、7.5、7.5 s |

### 4.1 “绝不静默永久删除”

三种情形会让外壳静默永久删除：目录超过回收站容量（实验里用注册表把该卷容量设成 1 MB，目录 24 MB）；用户设了“删除时不移到回收站”（`NukeOnDelete=1`）；路径超过上限。

- **所有靠标志位的组合都挡不住**：`SHFileOperation` 加 `FOF_ALLOWUNDO|FOF_NOCONFIRMATION|FOF_SILENT|FOF_NOERRORUI`，`IFileOperation` 加 `FOFX_RECYCLEONDELETE`、加 `FOFX_EARLYFAILURE`、不带 `ALLOWUNDO` 只带 `RECYCLEONDELETE`，在这三种情形下全部静默永久删除，返回码是成功。不带 `NOCONFIRMATION` 的组合会弹确认框，无界面环境下一直卡住（测试里 45 s 后被杀，文件夹因此保留）。`Shell.Application` 同样卡住或永久删除；PowerShell 的 VB 方案永久删除。
- **有效的保证**：`IFileOperation` 加进度回调 `IFileOperationProgressSink.PreDeleteItem`。外壳在真正删除前告诉我们 `dwFlags` 里有没有 `TSF_DELETE_RECYCLE_IF_POSSIBLE`（0x80），没有就返回失败中止。实测（自带小工具的 `ifos` 模式）：容量不足 → 失败，文件夹完好；`NukeOnDelete=1` → 失败，完好；路径 600 及以上 → 失败，完好；正常三万个文件 → 进了回收站、可还原，9.8 s。npm 包 `trash@10.1.1` 随包的 `windows-trash.exe` 在这几种情形下同样是失败（退出码 0x8000FFFF）而不是删除，说明它用了类似机制；没有读它的源码，是推断。**这个保证只在测过的这三种情形里验证过。**
- 路径长度的边界：文件全路径 200 到 560 个字符，`IFileOperation` 都进回收站并可还原；600 及以上外壳静默永久删除（边界在 560 到 600 之间，没有再细分）；PowerShell 的 VB 方案从 260 就永久删除，259 以内正常。传 `\\?\` 前缀的路径：所有候选都不接受（报错，文件夹完好）。运行器开了长路径开关，用户机器默认没开，边界可能不同。
- 预检（遍历目录取最长路径和总大小，读该卷回收站容量、`NukeOnDelete`、策略 `NoRecycleFiles`）在所有危险情形里都给出拒绝理由，正常情形通过；但它保守取 248，会拒绝一些其实能进回收站的路径（414 个字符的实例）。

### 4.2 改名的边界（各 1 次）

只改大小写 `Demo` → `demo` 成功。`con`、`nul`、`com1`、`aux`、`lpt1`、`CON.txt` 以及末尾带点或空格的名字（`foo.`、`bar `、`baz..`）用 `fs.rename` **全部成功**，目录里真的留下这些名字（Explorer 和多数程序处理不了）；含 `:*?"<>|` 的名字报 `ENOENT`；单段 300 个字符报 `ENOENT`；目标路径 352 个字符成功。Node 不会替我们挡这些名字，命名规则必须由产品自己检查。

## 5. 对照通过标准

| 标准 | 判定 | 依据 |
| --- | --- | --- |
| K9a：不弹任何权限框，不需要“完全磁盘访问” | 通过（只在负责人 Mac 的这一个上下文） | 调用立即返回、整轮无人值守跑完（没有看到屏幕）；其他终端、其他 macOS 版本、从 launchd 起的管理进程未验证 |
| K9a：从终端里的命令行和从管理进程调用都成功 | 部分 | 终端里的 Node 通过；管理进程（launchd/后台）未验证 |
| K9a：Finder 里看得到，拖回原处后项目完好 | 部分 | 用 `rename` 还原并校验一致（通过）；Finder 里看得到、拖回来未验证；“放回原处”：`rename` 方案没有，`/usr/bin/trash` 有 |
| K9a：记录耗时 | 通过 | 三万个文件 rename 0.1 到 0.8 ms；跨卷复制后删除 7 s（APFS），小文件多的 exFAT/FAT 运行器上 80 到 111 s（3,000 文件） |
| K9a：打进命令行的单文件后再试 | 未验证 | 只用 `node:fs`，没有原生模块，理论上无差别；没有实际打包 |
| K9b：改名 2 秒内成功 | 通过（运行器） | 30/30，中位数 1.4 ms，最大 2.1 ms；Defender 实时保护关着，管理员账号 |
| K9b：进回收站 10 秒内完成 | 未通过（边缘） | 约 3.1 万个文件，各实现 9.5 到 13 s，中位数约 10 s，超过 10 s 的约占一半 |
| K9b：可还原 | 通过 | 每个实现都还原了一次（把 `$R` 改回原位，不是在 Explorer 里点“还原”） |
| K9b：被占用时得到明确的 `PATH_LOCKED` | 部分 | 错误码稳定（`EBUSY`/`EPERM`，10/10）；“被谁占用”只有部分办法有效 |
| 补充：绝不静默永久删除 | 通过，靠进度回调加预检 | 靠标志位的做法在三种情形下全部失败 |

## 6. 决定与算法

### 6.1 macOS：`fs.trash`

```text
trashMac(dir):
  if exists("/usr/bin/trash")            # macOS 15.0 起自带
    run ["/usr/bin/trash", dir]          # 保留“放回原处”，毫秒级，无弹窗
    return
  trashDir = dirname(dir) 在 dir 所在卷上的废纸篓:
    同卷:  ~/.Trash
    别的卷: <卷挂载点>/.Trashes/<uid>    # 不存在就 mkdir：.Trashes 1333，<uid> 0700
  name = basename(dir)
  loop:
    try mkdir(trashDir/name)             # 文件用 open(wx)；占位，不列目录
    except EEXIST: name = name + " " + hh.mm.ss (再重名接 " 2"、" 3"…); continue
    break
  rename(dir, trashDir/name)             # 覆盖的只是自己刚建的空目录
  # 绝不对已有名字直接 rename：会静默覆盖同名空目录
  # 目标卷没有可用废纸篓目录时:
  #   复制到 ~/.Trash 下的临时名 -> 完整后才删原件；失败时原件原样保留
  # 不用 osascript 调 Finder（需要 Automation 权限）
```

没有 `/usr/bin/trash` 的老系统用 `rename` 方案，接受“没有放回原处”。随包带 Swift 小工具（59 KB，`FileManager.trashItem`）是备选，第一版不需要。

### 6.2 Windows：`fs.trash`

```text
trashWin(dir, regenerable):
  for sub in regenerable: if exists(dir/sub): directRemove(dir/sub)   # 负责人 2026-10-12 的决定：依赖目录直接删除，界面写明
  precheck(dir):                         # 保守，宁可拒绝
    walk -> longestPath, totalSize
    refuse if longestPath >= 248
    refuse if totalSize > recycleBinCapacity(volume)
    refuse if NukeOnDelete(volume) or policy NoRecycleFiles
  helper.exe trash dir:                  # 随包的小可执行文件，IFileOperation
    flags = ALLOWUNDO | NOCONFIRMATION | SILENT | NOERRORUI | RECYCLEONDELETE
    sink.PreDeleteItem(flags):
      if not (flags & TSF_DELETE_RECYCLE_IF_POSSIBLE /*0x80*/): return E_FAIL  # 中止，文件夹完好
```

预检拒绝或回调中止时，返回明确的错误码，不退到别的删除方式。这个小工具与可选的 Job Object 函数是**同一个**可执行文件，Windows 预览版的里程碑里做。PowerShell 的 `SendToRecycleBin` 做法在三种情形会静默永久删除，已从设计中删除。

### 6.3 改名与锁

- 改名失败码：`EBUSY`（当前目录在里面）、`EPERM`（文件被打开或子目录被监听）、`EACCES` 一律归为 `PATH_LOCKED`。监听项目文件夹本身不拦改名；进程被杀后实测约 2 ms 内释放（运行器）。
- 找占用者：读进程的当前目录（PEB）加命令行路径匹配；不依赖 Restart Manager。覆盖不到全部，界面要准备好“找不到是谁”的说法。
- 退避重试：这个场景下基本用不上（停掉 Vite 后 30/30 在 2.1 ms 内成功）；是否保留等真机有杀毒时复核后定。

### 6.4 名称校验（产品自己做）

管理进程校验名称，所有系统一致：只许小写字母、数字、连字符，首尾不是连字符；**拒绝 Windows 保留名**（`con`、`prn`、`aux`、`nul`、`com1` 到 `com9`、`lpt1` 到 `lpt9`，带扩展名的同样拒绝）；**拒绝末尾的点和空格**；这条在 macOS 和 Linux 上同样适用，保证资源库能搬到 Windows。原因：Node 的 `fs.rename` 在 Windows 上接受这些名字并真的建出来。

## 7. 接受的风险

- macOS 没有 `/usr/bin/trash` 的老系统，经 `rename` 进废纸篓的文件夹没有“放回原处”（仍可拖回）。
- Windows 三万个文件进回收站约 10 秒，不保证 10 秒内；界面显示进度。直接删除同样文件也要约 7.4 s，所以“依赖目录直接删除”省的是约 2.5 s 和回收站容量，不是大幅提速。
- 预检保守，会拒绝一些其实能进回收站的深路径。
- 静默永久删除的防线只在测过的三种情形里验证过。

## 8. 没有验证的

- macOS：其他终端、其他系统版本、从 launchd 起的管理进程的权限表现；打包进命令行单文件后的表现；Finder 里点“放回原处”。
- Windows：真机（普通账号、Windows 11、杀毒开着、长路径开关默认关）上的全部数字；Explorer 里点“还原”；非 C 盘、OneDrive 重定向、网络盘；回收站的实际容量设置；路径边界 560 到 600 之间的确切值；Restart Manager 失败的原因；`windows-trash.exe` 的失败机制；SEA 打包。

## 9. 需要在 Windows 真机上做的

普通用户账号；杀毒软件开着，重测三万个文件进回收站和改名；VS Code 开着该文件夹、内置终端开着时的占用表现；长路径开关默认关时的边界；在 Explorer 里点“还原”；项目放在非 C 盘、OneDrive 重定向目录、网络盘时回收站的表现；用户把回收站容量调小时预检和回调的表现。

## 10. 需要负责人在自己的 Mac 上看一次的

在 Finder 里：用 `/usr/bin/trash` 移进废纸篓的文件夹看得到，右键有“放回原处”并真能放回；用 `rename` 方案（没有 `/usr/bin/trash` 时）移进去的文件夹看得到、能拖回；有没有任何权限弹窗。

## 11. 过程中更正的两个错误结论

- 第一轮所有回收站候选都显示“永久删除”：原因一是造的假树里带一个约 660 个字符的深层目录，让外壳对整棵树永久删除；原因二是判定回收站记录时比较完整路径，运行器上临时目录的路径写法不同，把成功判成了永久删除。改为按目录名匹配、默认不造深层目录、把超长路径单独做成场景后重测。
- 一度怀疑“系统临时目录里的删除不进回收站”，实测不成立，已放弃。

## 12. 证据

- 合并的 PR：#3（`feat(spikes): K9 废纸篓与回收站技术验证`）。
- GitHub Actions 运行（`spike/k9-trash-rename` 分支，均成功）：[38172395503](https://github.com/paddychenc75/runyard/actions/runs/38172395503)（最后一轮，含全部实验）；[38170982897](https://github.com/paddychenc75/runyard/actions/runs/38170982897)（进度回调中止永久删除）；[38167815266](https://github.com/paddychenc75/runyard/actions/runs/38167815266)（去掉超长路径干扰、加预检）。
- 依赖：实验用的 `vite@8.3.1`（发布 2026-09-24）在 Windows 运行器上于一次性的测试文件夹里按 14 天规则安装；对照用过 `trash@10.1.1`，因其传递依赖 `braces@3.0.3` 有高危公告（GHSA-vfj7-8cjw-p6xm）已从实验里移除。两者都不进产品。
