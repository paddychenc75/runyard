import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { closePicker, expect, test } from "./support/fixtures.ts";

const shellArg = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

interface TerminalSnapshot {
  state: { kind: "running"; pid: number } | { kind: "none" | "ended" };
}
interface Status {
  playgrounds: { name: string; state: string; owner: string | null; url: string | null }[];
}

test("[DESKTOP-TERMINAL-33] 从终端启动另一项目，关闭宿主后原服务进程与命令行持有者仍在", async ({
  launch,
}) => {
  const instance = await launch({
    prepare: async ({ home }) => {
      // 测试只写临时HOME，稳定提示符不依赖用户的shell配置。
      writeFileSync(join(home, ".zshrc"), "PROMPT='READY401> '\n");
    },
  });
  const { page } = instance;
  await closePicker(page);
  await instance.cli("new", "html", "demo");
  await instance.cli("new", "hono", "api");
  const folder = join(instance.library, "api");
  // 继续走正式server运行器及真实Node进程；无依赖HTTP夹具避免把联网安装引入持有者测试。
  writeFileSync(
    join(folder, "package.json"),
    JSON.stringify({ name: "api", version: "1.0.0", type: "module" }),
  );
  writeFileSync(
    join(folder, "package-lock.json"),
    JSON.stringify({
      name: "api",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: { "": { name: "api", version: "1.0.0" } },
    }),
  );
  writeFileSync(
    join(folder, "src", "index.ts"),
    "import { createServer } from 'node:http';createServer((_,res)=>res.end('API401:'+process.pid)).listen(Number(process.env.PORT),'127.0.0.1');\n",
  );
  const metadata = join(folder, ".runyard", "playground.json");
  const file = JSON.parse(readFileSync(metadata, "utf8"));
  writeFileSync(metadata, JSON.stringify({ ...file, packageManager: "npm" }));
  const projectId = async () =>
    (
      await instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get")
    ).playgrounds.find((item) => item.name === "demo")?.id;
  await expect.poll(projectId).toBeDefined();
  const id = await projectId();
  await instance.call("tab.openWithoutRun", id);
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.locator(".xterm").first();
  await expect(terminal).toContainText("READY401>");
  const shell = (await instance.call<TerminalSnapshot>("terminal.attach", { project: id })).state;
  if (shell.kind !== "running") throw new Error("测试终端没有运行");
  const shellIdentity = await instance.platform.proc.identity(shell.pid);
  expect(shellIdentity).not.toBeNull();
  await terminal.click();
  // 应用采用隔离的 --root；终端命令必须显式指向同一库，不使用临时 HOME 下的默认库。
  const cli = process.env.RUNYARD_E2E_APP
    ? "runyard"
    : `${shellArg(process.execPath)} ${shellArg(resolve(import.meta.dirname, "../../../packages/cli/src/main.ts"))}`;
  await page.keyboard.type(`${cli} run api --root ${shellArg(instance.root)} --json`);
  await page.keyboard.press("Enter");
  const api = async () =>
    ((await instance.cli("status")) as Status).playgrounds.find((item) => item.name === "api");
  await expect.poll(api).toMatchObject({ state: "ready", owner: "cli" });
  const before = await api();
  if (!before?.url) throw new Error("服务没有就绪地址");
  const body = await (await fetch(before.url)).text();
  const pid = Number(body.replace("API401:", ""));
  const identity = await instance.platform.proc.identity(pid);
  expect(identity).not.toBeNull();
  await expect(terminal).toContainText('"ready"');
  await expect
    .poll(() => instance.call("terminal.status", { project: id }))
    .toMatchObject({ open: true, command: null });
  await page.getByRole("button", { name: "Close demo", exact: true }).click();
  await expect(page.getByRole("tab", { name: /demo/ })).toHaveCount(0);
  await expect.poll(() => instance.platform.proc.identity(shell.pid)).toBeNull();
  // 标签先消失，终端收尾随后完成；必须等服务确认已释放，才判断另一运行没有被误停。
  await expect
    .poll(() => instance.call("terminal.status", { project: id }))
    .toMatchObject({ open: false, command: null });
  expect(await api()).toMatchObject({ state: "ready", owner: "cli", url: before.url });
  expect(await instance.platform.proc.identity(pid)).toEqual(identity);
  expect(await (await fetch(before.url)).text()).toBe(body);
  await instance.cli("stop", "api");
  await expect.poll(() => instance.platform.proc.identity(pid)).toBeNull();
});
