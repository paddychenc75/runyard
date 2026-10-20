import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import electron from "electron";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it } from "vitest";
import { buildVueLanguageService } from "../../../packaging/vue-language-service.ts";
import {
  vueDiagnosticMarkers,
  vueHover,
} from "../../renderer/features/editor/vue-inspection-items.ts";
import { vueDefinitionTargets } from "../vue-language/vue-definition-targets.ts";
import { VueOperations } from "../vue-language/vue-operations.ts";
import { createVueSession } from "../vue-language/vue-session.ts";
import { launchLanguageProcess } from "./vue-process.ts";
import { copyVueTypes, registerLanguageProcess } from "./vue-test-support/fixture.ts";

async function fixture(withTypes: boolean) {
  const desktop = resolve(import.meta.dirname, "../../..");
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-inspection-")));
  const project = join(home, "project");
  cpSync(resolve(desktop, "../../tooling/scripts/vue-smoke-fixture"), project, { recursive: true });
  mkdirSync(join(project, "src", "components"));
  cpSync(join(project, "src", "Child.vue"), join(project, "src", "components", "Child.vue"));
  if (withTypes) copyVueTypes(project, resolve(desktop, "../../tooling"));
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: "preserve",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
    }),
  );
  const service = await buildVueLanguageService(desktop, join(home, "bundle"));
  const platform = getPlatform({ home: absPath(home) });
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
        registered: (ref) => registerLanguageProcess(platform, ref),
      }),
  });
  const operations = new VueOperations();
  const file = join(project, "src", "Use.vue");
  let version = 0;
  let text = "";
  return {
    project,
    session,
    operations,
    file,
    sync: async (value: string) => {
      text = value;
      await session.sync({ file, text, version: ++version });
    },
    request: (
      kind: "completion" | "hover" | "definition" | "diagnostics",
      needle: string,
      extra = 0,
    ) => {
      const before = text.slice(0, text.indexOf(needle) + extra).split("\n");
      return operations.request(session, file, {
        project: "p",
        path: "src/Use.vue",
        requestId: String(version),
        kind,
        position: { line: before.length - 1, character: before.at(-1)?.length ?? 0 },
      });
    },
  };
}

it("[DESKTOP-EDITOR-87] 没装Vue依赖时官方服务仍给出本地组件属性名", async () => {
  const host = await fixture(false);
  try {
    await host.sync(
      '<script setup lang="ts">\nimport Child from "./Child.vue";\n</script>\n<template><Child  /></template>',
    );
    const result = (await host.request("completion", "<Child  />", 7)) as {
      candidates: { item: { label?: string; name?: string } }[];
    };
    expect(
      result.candidates.map(({ item }) => (item.label ?? item.name ?? "").replace(/^:/, "")),
    ).toEqual(expect.arrayContaining(["title", "count", "tone"]));
  } finally {
    await host.session.stop();
  }
});

const severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as typeof Monaco.MarkerSeverity;
it("[DESKTOP-EDITOR-46] [DESKTOP-EDITOR-82] [DESKTOP-EDITOR-83] [DESKTOP-EDITOR-84] [DESKTOP-EDITOR-85] 真实依赖与别名的悬停和跳转，没有误报", async () => {
  const host = await fixture(true);
  try {
    await host.sync(
      '<script setup lang="ts">\nimport Child from "@/components/Child.vue";\nimport { ref } from "vue";\nconst n = ref(1);\n</script>\n<template><Child title="ok" :count="n" /></template>',
    );
    expect(JSON.stringify(vueHover(await host.request("hover", "const n", 6)))).toContain(
      "Ref<number",
    );
    expect(JSON.stringify(vueHover(await host.request("hover", 'title="ok"', 1)))).toContain(
      "title: string",
    );
    const component = await vueDefinitionTargets(
      host.project,
      await host.request("definition", "<Child", 2),
    );
    expect(component.targets[0]?.path).toBe("src/components/Child.vue");
    const property = await vueDefinitionTargets(
      host.project,
      await host.request("definition", 'title="ok"', 1),
    );
    expect(property.targets).toContainEqual(
      expect.objectContaining({
        path: "src/components/Child.vue",
        range: expect.objectContaining({ start: expect.objectContaining({ line: 2 }) }),
      }),
    );
    expect(
      vueDiagnosticMarkers(await host.request("diagnostics", ""), severity).filter(
        (marker) => marker.severity === 8,
      ),
    ).toEqual([]);
    const outside = await vueDefinitionTargets(host.project, {
      ts: [
        {
          file: join(host.project, "..", "outside.vue"),
          start: { line: 1, offset: 1 },
          end: { line: 1, offset: 2 },
        },
        {
          file: join(host.project, "node_modules", "vue", "dist", "vue.d.ts"),
          start: { line: 1, offset: 1 },
          end: { line: 1, offset: 2 },
        },
      ],
    });
    expect(outside.targets).toEqual([]);
  } finally {
    await host.session.stop();
  }
});
it("[DESKTOP-EDITOR-86] 脚本类型、属性类型、缺必填属性与未声明变量分别有诊断", async () => {
  const host = await fixture(true);
  try {
    await host.sync(
      '<script setup lang="ts">\nimport Child from "./Child.vue";\nconst s: string = 1;\n</script>\n<template>\n<Child title="ok" :count="\'x\'" />\n<Child :count="1" />\n{{ missingVar }}\n</template>',
    );
    const errors = vueDiagnosticMarkers(await host.request("diagnostics", ""), severity).filter(
      (marker) => marker.severity === 8,
    );
    expect(errors.map((marker) => marker.code)).toEqual(
      expect.arrayContaining(["2322", "2345", "2339"]),
    );
    expect(new Set(errors.map((marker) => marker.startLineNumber)).size).toBeGreaterThanOrEqual(4);
  } finally {
    await host.session.stop();
  }
});

it("项目已存在不同版本的Vue声明时始终优先项目，不使用随包兜底", async () => {
  const host = await fixture(false);
  try {
    const installed = join(host.project, "node_modules", "vue");
    mkdirSync(installed, { recursive: true });
    writeFileSync(
      join(installed, "package.json"),
      JSON.stringify({ name: "vue", version: "0.0.0-project-fixture", types: "index.d.ts" }),
    );
    writeFileSync(
      join(installed, "index.d.ts"),
      "export interface ProjectOwnedRef<T> { value: T; projectOnly: true }\nexport declare function ref<T>(value:T): ProjectOwnedRef<T>;",
    );
    await host.sync(
      '<script setup lang="ts">\nimport { ref } from "vue";\nconst n = ref(1);\n</script>\n<template>{{ n }}</template>',
    );
    expect(JSON.stringify(await host.request("hover", "const n", 6))).toContain(
      "ProjectOwnedRef<number",
    );
  } finally {
    await host.session.stop();
  }
});
