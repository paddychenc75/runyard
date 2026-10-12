// 测试用的“启动者”：连上管理进程（必要时拉起它），打印一行 connected，然后一直不退出，
// 留给测试去强杀它，验证管理进程与启动者脱钩（规格 SUPERVISOR-LIFECYCLE-08）。
// 用法：node launch-and-hold.fixture.ts <home> <build> <管理进程入口文件>
import { absPath, getPlatform } from "@runyard/platform";
import { connectSupervisor } from "./connect-supervisor.ts";

const [home, build, entry] = process.argv.slice(2) as [string, string, string];
const platform = getPlatform({ home: absPath(home), profile: undefined });
const client = await connectSupervisor({
  platform,
  client: { kind: "cli", version: "0.0.0-it", build },
  launch: { command: [process.execPath, entry] },
});
// i18n-allow: 测试用启动者的标准输出，只给测试读，不给用户看
process.stdout.write(`connected ${client.launched}\n`);
setInterval(() => {}, 1000);
