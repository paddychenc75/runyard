import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { absPath, getPlatform, type ProcRef } from "@runyard/platform";
import electron from "electron";
import { describe, expect, it } from "vitest";
import { buildVueLanguageService } from "../../../packaging/vue-language-service.ts";
import { createVueSession } from "../vue-language/vue-session.ts";
import { launchLanguageProcess } from "./vue-process.ts";
import { copyVueTypes, registerLanguageProcess } from "./vue-test-support/fixture.ts";

const desktop = resolve(import.meta.dirname, "../../..");
describe("真实受限 Vue 进程", () => {
  it("[DESKTOP-EDITOR-90] [DESKTOP-EDITOR-91] 官方服务读项目类型获得属性补全，关闭两进程均退出", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-process-")));
    const project = join(home, "project");
    cpSync(resolve(desktop, "../../tooling/scripts/vue-smoke-fixture"), project, {
      recursive: true,
    });
    copyVueTypes(project, resolve(desktop, "../../tooling"));
    const service = await buildVueLanguageService(desktop, join(home, "bundle"));
    const platform = getPlatform({ home: absPath(home) });
    const refs: ProcRef[] = [];
    const session = await createVueSession({
      folder: project,
      failed: () => {},
      launch: (target) =>
        launchLanguageProcess({
          target,
          project,
          service,
          home,
          executable: electron as unknown as string,
          platform,
          registered: (ref) => {
            refs.push(ref);
            registerLanguageProcess(platform, ref);
          },
        }),
    });
    try {
      const file = join(project, "src", "Use.vue");
      const text = readFileSync(file, "utf8");
      await session.sync({ file, text, version: 1 });
      const before = text.slice(0, text.lastIndexOf("<Child  />") + 7).split("\n");
      const result = (await session.request("vue", "textDocument/completion", {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line: before.length - 1, character: before.at(-1)?.length },
      })) as { items: { label: string }[] };
      const labels = result.items.map((item) => item.label.replace(/^:/, ""));
      expect(labels).toContain("title");
      expect(labels).toContain("count");
    } finally {
      await session.stop();
    }
    expect(refs).toHaveLength(2);
    for (const ref of refs) expect(await platform.proc.identity(ref.pid)).toBeNull();
  });
  it("[DESKTOP-EDITOR-90] 同一启动入口拒绝外部读取、写入、子进程、线程与网络", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-permission-")));
    const project = join(home, "project");
    mkdirSync(project);
    const service = await buildVueLanguageService(desktop, join(home, "bundle"));
    const outside = join(home, "secret");
    writeFileSync(outside, "secret");
    const probe = `const attempts = [
      ()=>require('fs').readFileSync(${JSON.stringify(outside)}),
      ()=>require('fs').writeFileSync(${JSON.stringify(join(project, "write"))},'no'),
      ()=>require('child_process').spawn(process.execPath,[]),
      ()=>new (require('worker_threads').Worker)('',{eval:true}),
      ()=>require('net').connect(80,'127.0.0.1'),
      ()=>new (require('net').Socket)().connect(80,'127.0.0.1'),
      ()=>require('http').get('http://127.0.0.1'),
      ()=>require('https').get('https://127.0.0.1'),
      ()=>fetch('http://127.0.0.1'),
      ()=>require('dns').lookup('localhost',()=>{}),
      ()=>require('dns/promises').resolve4('localhost'),
      ()=>new (require('http').ClientRequest)('http://127.0.0.1'),
      ()=>new (require('https').Agent)().createConnection({host:'127.0.0.1',port:443}),
      ()=>new (require('http').Agent)().createConnection({host:'127.0.0.1',port:80}),
      ()=>new (require('dgram').Socket)('udp4').send('x',80,'127.0.0.1'),
      ()=>new (require('net').Server)().listen(0,'127.0.0.1')
    ]; const blocked=attempts.map(f=>{try{f();return false}catch{return true}});
    const watcher=require('fs').watch(${JSON.stringify(outside)}); watcher.close();
    require('fs').watchFile(${JSON.stringify(outside)},()=>{}).unref();
    require('fs/promises').watch(${JSON.stringify(outside)}).next().then(result=>{
      process.stdout.write(JSON.stringify({blocked, outsideWatchDone:result.done}));
    }); process.stdin.resume();`;
    writeFileSync(join(service, "server", "vue-language-server.cjs"), probe);
    const platform = getPlatform({ home: absPath(home) });
    const child = await launchLanguageProcess({
      target: "vue",
      project,
      service,
      home,
      executable: electron as unknown as string,
      platform,
      registered: (ref) => registerLanguageProcess(platform, ref),
    });
    try {
      const result = await new Promise<string>((resolve) =>
        child.onData((data) => resolve(data.toString())),
      );
      expect(JSON.parse(result)).toEqual({
        blocked: Array.from({ length: 16 }, () => true),
        outsideWatchDone: true,
      });
    } finally {
      await child.stop();
    }
  });
  it("[DESKTOP-EDITOR-91] 身份暂时不可取得也收回本人进程，不无限等待", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-identity-")));
    const project = join(home, "project");
    mkdirSync(project);
    const service = await buildVueLanguageService(desktop, join(home, "bundle"));
    writeFileSync(join(service, "server", "vue-language-server.cjs"), "process.stdin.resume();");
    const platform = getPlatform({ home: absPath(home) });
    const refs: ProcRef[] = [];
    const unavailableIdentity = {
      proc: {
        ...platform.proc,
        identity: async (pid: number) => {
          const identity = await platform.proc.identity(pid);
          if (identity) {
            const ref = { pid, startTime: identity.startTime };
            refs.push(ref);
            registerLanguageProcess(platform, ref);
          }
          return null;
        },
      },
    };
    await expect(
      launchLanguageProcess({
        target: "vue",
        project,
        service,
        home,
        executable: electron as unknown as string,
        platform: unavailableIdentity,
      }),
    ).rejects.toThrow("LANGUAGE_PROCESS_EXITED");
    expect(refs).toHaveLength(1);
    for (const ref of refs) expect(await platform.proc.identity(ref.pid)).toBeNull();
  });
});
