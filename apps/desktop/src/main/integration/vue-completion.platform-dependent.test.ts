import { cpSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import electron from "electron";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it } from "vitest";
import { buildVueLanguageService } from "../../../packaging/vue-language-service.ts";
import { vueCompletionItems } from "../../renderer/features/editor/vue-completion-items.ts";
import { VueOperations } from "../vue-language/vue-operations.ts";
import { createVueSession } from "../vue-language/vue-session.ts";
import { launchLanguageProcess } from "./vue-process.ts";
import { copyVueTypes, registerLanguageProcess } from "./vue-test-support/fixture.ts";

it("[DESKTOP-EDITOR-79] [DESKTOP-EDITOR-80] [DESKTOP-EDITOR-81] [DESKTOP-EDITOR-82] 官方服务经转换返回组件、属性、事件与真实依赖导出", async () => {
  const desktop = resolve(import.meta.dirname, "../../..");
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-completion-")));
  const project = join(home, "project");
  cpSync(resolve(desktop, "../../tooling/scripts/vue-smoke-fixture"), project, { recursive: true });
  copyVueTypes(project, resolve(desktop, "../../tooling"));
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
  const complete = async (text: string) => {
    const offset = text.indexOf("|");
    const content = text.replace("|", "");
    await session.sync({ file, text: content, version: ++version });
    const before = content.slice(0, offset).split("\n");
    const line = before.length - 1;
    const character = before.at(-1)?.length ?? 0;
    const raw = await operations.request(session, file, {
      project: "p",
      path: "src/Use.vue",
      requestId: String(version),
      kind: "completion",
      position: { line, character },
    });
    return vueCompletionItems(raw, {
      session: "model",
      version,
      kinds: { Text: 18 } as typeof Monaco.languages.CompletionItemKind,
      range: {
        startLineNumber: line + 1,
        endLineNumber: line + 1,
        startColumn: character + 1,
        endColumn: character + 1,
      },
    }).suggestions;
  };
  const script = '<script setup lang="ts">\nimport Child from "./Child.vue";\n</script>\n';
  try {
    expect(
      (await complete(`${script}<template><Chi|</template>`)).map((item) => item.label),
    ).toContain("Child");
    const attributes = await complete(`${script}<template><Child | /></template>`);
    expect(attributes.map((item) => String(item.label).replace(/^:/, ""))).toEqual(
      expect.arrayContaining(["title", "count", "tone"]),
    );
    expect(
      attributes.find((item) => String(item.label).replace(/^:/, "") === "title")?.insertText,
    ).toContain("title");
    expect(
      (await complete(`${script}<template><Child @| /></template>`)).map((item) => item.label),
    ).toEqual(expect.arrayContaining(["@select", "@close"]));
    expect(
      (await complete('<script setup lang="ts">\nimport { | } from "vue";\n</script>')).map(
        (item) => item.label,
      ),
    ).toEqual(expect.arrayContaining(["watch", "computed"]));
    expect(
      (
        await complete(
          '<script setup lang="ts">\nimport { ref } from "vue";\nconst n = ref(1);\nn.|\n</script>',
        )
      ).map((item) => item.label),
    ).toContain("value");
  } finally {
    await session.stop();
  }
});
