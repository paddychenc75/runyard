import { cpSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import electron from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildVueLanguageService } from "../../../packaging/vue-language-service.ts";
import type { VueDiagnostics } from "../../shared/vue-language.ts";
import { EditorFileService } from "../editor-files/file-service.ts";
import { VueChannel } from "../vue-language/vue-channel.ts";
import { VueProjects } from "../vue-language/vue-projects.ts";
import { createVueSession } from "../vue-language/vue-session.ts";
import { watchVueDependencies } from "./vue-dependency-watch.ts";
import { launchLanguageProcess } from "./vue-process.ts";
import { copyVueTypes, registerLanguageProcess } from "./vue-test-support/fixture.ts";

const desktop = resolve(import.meta.dirname, "../../..");
async function setup(withTypes: boolean) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-channel-")));
  const project = join(home, "project");
  cpSync(resolve(desktop, "../../tooling/scripts/vue-smoke-fixture"), project, { recursive: true });
  if (withTypes) copyVueTypes(project, resolve(desktop, "../../tooling"));
  const service = await buildVueLanguageService(desktop, join(home, "bundle"));
  const platform = getPlatform({ home: absPath(home) });
  const projects = new VueProjects((folder, failed) =>
    createVueSession({
      folder,
      failed,
      launch: (target) =>
        launchLanguageProcess({
          target,
          project: folder,
          service,
          home,
          executable: electron as unknown as string,
          platform,
          registered: (ref) => registerLanguageProcess(platform, ref),
        }),
    }),
  );
  const diagnostics: VueDiagnostics[] = [];
  const channel = new VueChannel({
    projects,
    folderOf: (id) => (id === "p" ? project : null),
    diagnostics: (event) => diagnostics.push(event),
    watchDependencies: watchVueDependencies,
  });
  const files = new EditorFileService({
    platform,
    projectFolder: () => project,
    onChange: (id, changes) => {
      void channel.filesChanged(id, changes);
    },
  });
  await files.watch("p");
  return {
    home,
    project,
    channel,
    diagnostics,
    close: async () => {
      await files.dispose();
      await channel.dispose();
    },
  };
}

describe("Vue 项目窄通道", () => {
  it("项目外、绝对路径、.. 与符号链接越界都不进入服务", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-path-")));
    const project = join(home, "project");
    mkdirSync(project);
    writeFileSync(join(home, "Outside.vue"), "secret");
    symlinkSync(join(home, "Outside.vue"), join(project, "Escape.vue"));
    let launched = 0;
    const projects = new VueProjects(async () => {
      launched++;
      throw new Error("must not launch");
    });
    const channel = new VueChannel({ projects, folderOf: () => project, diagnostics: () => {} });
    try {
      for (const path of [
        "../Outside.vue",
        join(home, "Outside.vue"),
        "Escape.vue",
        "sub/../../Outside.vue",
      ]) {
        expect(
          await channel.open({ project: "p", path, text: "x", version: 1, session: "old" }),
        ).toEqual({
          ok: false,
          reason: "invalid",
        });
      }
      expect(launched).toBe(0);
    } finally {
      await channel.dispose();
    }
  });
  it("[DESKTOP-EDITOR-88] 外部修改组件属性，经现有文件监听推送新诊断", async () => {
    const fixture = await setup(true);
    try {
      const use =
        '<script setup lang="ts">\nimport Child from "./Child.vue";\n</script>\n<template><Child title="ok" /></template>';
      writeFileSync(
        join(fixture.project, "src", "Child.vue"),
        '<script setup lang="ts">defineProps<{ title: string }>();</script>',
      );
      writeFileSync(join(fixture.project, "src", "Use.vue"), use);
      expect(
        (
          await fixture.channel.open({
            project: "p",
            path: "src/Use.vue",
            text: use,
            version: 1,
            session: "old",
          })
        ).ok,
      ).toBe(true);
      await expect.poll(() => fixture.diagnostics.length, { timeout: 10_000 }).toBeGreaterThan(0);
      const previous = fixture.diagnostics.length;
      writeFileSync(
        join(fixture.project, "src", "Child.vue"),
        '<script setup lang="ts">defineProps<{ renamed: string }>();</script>',
      );
      await expect
        .poll(() => JSON.stringify(fixture.diagnostics.slice(previous)), { timeout: 10_000 })
        .toContain("renamed");
    } finally {
      await fixture.close();
    }
  });
  it("[DESKTOP-EDITOR-88] 依赖从无到有后，悬停读到真实 Vue 类型", async () => {
    const fixture = await setup(false);
    try {
      const text =
        '<script setup lang="ts">\nimport { ref } from "vue";\nconst value = ref(1);\n</script>\n<template>{{ value }}</template>';
      writeFileSync(join(fixture.project, "src", "Use.vue"), text);
      expect(
        (
          await fixture.channel.open({
            project: "p",
            path: "src/Use.vue",
            text,
            version: 1,
            session: "old",
          })
        ).ok,
      ).toBe(true);
      const hover = () =>
        fixture.channel.request({
          project: "p",
          path: "src/Use.vue",
          requestId: "hover",
          kind: "hover",
          position: { line: 2, character: 7 },
        });
      expect(JSON.stringify(await hover())).toContain("Ref<number");
      const installed = join(fixture.project, "node_modules", "vue");
      mkdirSync(installed, { recursive: true });
      writeFileSync(
        join(installed, "package.json"),
        JSON.stringify({ name: "vue", version: "0.0.0-project-fixture", types: "index.d.ts" }),
      );
      writeFileSync(
        join(installed, "index.d.ts"),
        "export interface ActualInstalledRef<T> { value: T; projectOnly: true }\nexport declare function ref<T>(value:T): ActualInstalledRef<T>;",
      );
      await expect
        .poll(async () => JSON.stringify(await hover()), { timeout: 10_000 })
        .toContain("ActualInstalledRef<number");
    } finally {
      await fixture.close();
    }
  });
  it("旧模型晚到的关闭不会关掉重新打开的新版本文档", async () => {
    const fixture = await setup(true);
    try {
      const text =
        '<script setup lang="ts">const value = 1;</script><template>{{ value }}</template>';
      const document = { project: "p", path: "src/Use.vue", text, version: 10, session: "old" };
      await fixture.channel.open(document);
      await fixture.channel.open({
        ...document,
        text: text.replace("= 1", "= 2"),
        version: 1,
        session: "new",
      });
      await fixture.channel.sync({ ...document, version: 11 });
      await fixture.channel.closeDocument({
        project: "p",
        path: document.path,
        version: 10,
        session: "old",
      });
      const request = {
        project: "p",
        path: document.path,
        requestId: "probe",
        kind: "hover" as const,
        position: { line: 0, character: 31 },
      };
      expect((await fixture.channel.request(request)).ok).toBe(true);
      await expect
        .poll(
          () => fixture.diagnostics.some((event) => event.session === "new" && event.version === 1),
          { timeout: 10_000 },
        )
        .toBe(true);
      await fixture.channel.closeDocument({
        project: "p",
        path: document.path,
        version: 1,
        session: "new",
      });
      expect(await fixture.channel.request(request)).toEqual({ ok: false, reason: "invalid" });
    } finally {
      await fixture.close();
    }
  });
  it("请求取得会话时关闭项目：立即取消，关闭等待取得结束后收尾，不能再次启动", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-close-race-")));
    const fake = () => ({
      request: vi.fn(async () => ({})),
      sync: vi.fn(async () => {}),
      closeDocument: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      changed: vi.fn(),
      reloadProjects: vi.fn(),
    });
    const sessions: ReturnType<typeof fake>[] = [];
    const projects = new VueProjects(async () => {
      const session = fake();
      sessions.push(session);
      return session;
    });
    const channel = new VueChannel({ projects, folderOf: () => home, diagnostics: () => {} });
    await channel.open({ project: "p", path: "Use.vue", text: "", version: 1, session: "one" });
    await projects.close("p");
    let release = () => {};
    let entered = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalOpen = projects.open.bind(projects);
    vi.spyOn(projects, "open").mockImplementation(async (id, folder) => {
      entered = true;
      await gate;
      return originalOpen(id, folder);
    });
    const pending = channel.request({
      project: "p",
      path: "Use.vue",
      requestId: "race",
      kind: "hover",
      position: { line: 0, character: 0 },
    });
    await expect.poll(() => entered).toBe(true);
    let closed = false;
    const closing = channel.close("p").then(() => {
      closed = true;
    });
    expect(await pending).toEqual({ ok: false, reason: "cancelled" });
    expect(closed).toBe(false);
    release();
    await closing;
    await projects.idle();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.stop.mock.calls.length === 1)).toBe(true);
    expect(projects.current("p")).toBeNull();
    await channel.dispose();
  });
  it("[DESKTOP-EDITOR-91] 最后一个Vue文档关闭后，退出仍释放依赖监听", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-watch-release-")));
    const stopWatch = vi.fn();
    const projects = new VueProjects(async () => ({
      request: async () => ({}),
      sync: async () => {},
      closeDocument: async () => {},
      stop: async () => {},
      changed: () => {},
      reloadProjects: () => {},
    }));
    const channel = new VueChannel({
      projects,
      folderOf: () => home,
      diagnostics: () => {},
      watchDependencies: async () => stopWatch,
    });
    await channel.open({ project: "p", path: "Use.vue", text: "", version: 1, session: "one" });
    await channel.closeDocument({ project: "p", path: "Use.vue", version: 1, session: "one" });
    await channel.dispose();
    expect(stopWatch).toHaveBeenCalledOnce();
  });
});
