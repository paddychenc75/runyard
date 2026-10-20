# M3 整包串联验收

来源：issue #267、PRD #prd-release-plan、PRD #prd-editor、PRD #prd-terminal。

## 串联方法

`apps/desktop/e2e/m3-flow.e2e.ts` 用同一份临时 HOME、资源库和真实项目完成：

1. 在应用选择器里键盘新建 HTML，等待原生预览显示。
2. 在真实 Monaco 中键盘改写、保存文件，核对磁盘和原生预览中的新文字。
3. 在应用终端通过键盘运行 npm，使用 `--offline --ignore-scripts --no-audit --no-fund` 安装临时目录中的 `file:` 依赖；没有引入外部包或注册表请求。随后由 Node 实际 `require` 该依赖，核对导出文字。完整输出标记不在输入命令里，命令回显不能冒充执行成功。
4. 检查项目的 package.json、package-lock.json 和 node_modules 中实际安装的包；等待前台命令结束，并确认原 shell 的 PID 与启动时间没有变化。
5. 从界面关闭项目并确认停止，核对标签消失、运行已停止、终端已释放、原 shell 退出、原预览端口可用。

所有路径参数按 shell 单引号转义；实例由既有 launch 夹具登记与清理，不操作用户资源库、shell 配置或已安装的应用。

## 2026-10-20 结果

在 Apple M3 Max / macOS 27.0.1 / Electron 44.5.1 上，生产代码为 `f4021092`，使用 #517 同产品代码的 e2e 包（该分支额外改动只有测试和检查器），首次执行 1/1 通过：用例 5.5 秒、整次 Playwright 7.2 秒。包已通过 fuse 与 codesign 检查。

上述耗时仅是本次验收运行记录，不是性能目标测量；运行期间另一个工作树正在完整 verify，不以此推断界面响应性能。原日志为该次临时产物 `tmp.oXHbf2h1QL/m3-e2e.log`；CI 同样运行正式 `*.e2e.ts` 用例，远端结果见本改动 PR。

在另打的 e2e 包上复核：

```sh
RUNYARD_E2E_APP="<e2e包>/Runyard.app/Contents/MacOS/Runyard" \
  pnpm --filter @runyard/desktop e2e:run m3-flow.e2e.ts
```

## 尚不由本用例证明

- 外部修改同时更新编辑器与预览、终端启动另一个项目的持有者隔离：由 #517 的独立真实回归验证。
- EDITOR-74 的 10000 文件快速打开 200ms / 每字过滤 100ms，以及 TERMINAL-24 的持续10秒大量输出时交互响应：须在无竞争负载的真实包上单独量，不能用本次耗时替代。
- 系统输入法真实候选窗、下载后首次 Gatekeeper 提示：需要系统级手验；CDP composition 和命令行启动不等价。
- 中英浅深各页面设计对照、M1 skill-only 智能体回路与规格归档审计：复用或补足各自证据。本用例通过不代表 #267 的所有完成标准已满足。
