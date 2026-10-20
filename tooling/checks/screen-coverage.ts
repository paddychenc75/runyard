import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readText } from "./docs.ts";
import { parseSource, ts, visit } from "./ts-source.ts";

interface Scene {
  id: string;
  boards: string[];
}
interface Board {
  title: string;
  page: string;
}
const MANIFEST = "apps/desktop/visual/scenes.ts";
const EXTRA = [
  "WorkspaceRename",
  "AutoCleanDialog",
  "UpdateBanner",
  "Notify",
  "NotifyCenter",
  "SettingsNarrow",
];

/** 只接受可审查的字面量登记，不执行应用模块。动态拼接不能当作覆盖证据。 */
export function readScreenScenes(source: string): Scene[] {
  const scenes: Scene[] = [];
  visit(parseSource(MANIFEST, source), (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== "scenes" || !node.initializer)
      return;
    const value = ts.isAsExpression(node.initializer)
      ? node.initializer.expression
      : node.initializer;
    if (!ts.isArrayLiteralExpression(value)) return;
    for (const item of value.elements) {
      if (!ts.isObjectLiteralExpression(item)) continue;
      let id = "";
      const boards: string[] = [];
      for (const property of item.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = property.name.getText().replaceAll('"', "");
        if (name === "id" && ts.isStringLiteral(property.initializer))
          id = property.initializer.text;
        if (name === "boards" && ts.isArrayLiteralExpression(property.initializer)) {
          for (const board of property.initializer.elements)
            if (ts.isStringLiteral(board)) boards.push(board.text);
        }
      }
      if (id) scenes.push({ id, boards });
    }
  });
  return scenes;
}

export function screenCoverage(boards: Record<string, Board>, scenes: readonly Scene[]): string[] {
  const errors: string[] = [];
  const names = new Set(Object.keys(boards).map((name) => name.replace(/\.dc\.html$/, "")));
  const numbered = Object.entries(boards).filter(
    ([, board]) => board.page === "zh" && /^(0[1-9]|[12]\d|3[0-3]) /.test(board.title),
  );
  const required = new Set(
    numbered
      .filter(([, board]) => !board.title.startsWith("32 "))
      .map(([name]) => name.replace(/\.dc\.html$/, "")),
  );
  for (const name of EXTRA) if (names.has(name)) required.add(name);
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const scene of scenes) {
    if (ids.has(scene.id)) errors.push(`画面场景重复：${scene.id}。每个场景只登记一次。`);
    ids.add(scene.id);
    if (scene.boards.length === 0) errors.push(`画面${scene.id}没有对应画板。`);
    for (const board of scene.boards) {
      if (!names.has(board)) errors.push(`画面${scene.id}引用了不存在的画板${board}。`);
      if (board === "Unused") errors.push("第32号长期未使用已明确延期，不能伪造第一版画面覆盖。");
      covered.add(board);
    }
  }
  for (const board of required)
    if (!covered.has(board))
      errors.push(`画板${board}缺少可执行画面场景；登记到${MANIFEST}并补截图和伪语言扫描。`);
  return errors;
}

export function checkScreenCoverage(
  root: string,
  budget?: { file: number; total: number; existingBytes: number },
): string[] {
  if (!existsSync(join(root, "docs/design/canvas.json"))) return [];
  if (!existsSync(join(root, MANIFEST))) return [`缺少${MANIFEST}，不能用组件样例代替画面级覆盖。`];
  const canvas = JSON.parse(readText(root, "docs/design/canvas.json")) as {
    boards: Record<string, Board>;
  };
  const scenes = readScreenScenes(readText(root, MANIFEST));
  const errors = screenCoverage(canvas.boards, scenes);
  if (!existsSync(join(root, "apps/desktop/visual/screens.spec.ts")))
    errors.push("画面清单没有对应的Playwright执行入口screens.spec.ts。");
  const directory = join(root, "apps/desktop/visual/__screenshots__");
  if (existsSync(directory)) {
    const names = readdirSync(directory);
    const expected = scenes.flatMap((scene) =>
      ["light-zh-CN", "light-en", "dark-zh-CN", "dark-en", "light-en-XA"].map(
        (combination) => `${scene.id}-${combination}.png`,
      ),
    );
    for (const name of expected)
      if (!names.includes(name))
        errors.push(`画面基准缺少${name}，使用update-screen-baseline标签让macOS CI生成。`);
    let bytes = budget?.existingBytes ?? 0;
    for (const name of names) {
      if (!expected.includes(name))
        errors.push(`未登记的画面基准${name}，核对场景清单，不要保留孤立截图。`);
      const size = statSync(join(directory, name)).size;
      bytes += size;
      if (budget && size > budget.file)
        errors.push(`画面基准${name}超出既有单张200KB预算，不要调整阈值。`);
    }
    if (budget && bytes > budget.total)
      errors.push("组件与画面基准合计超出既有30MB预算，不要分目录绕过总量限制。");
  }
  return errors;
}
