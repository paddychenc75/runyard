import { describe, expect, it } from "vitest";
import { detectEditors } from "./external-editors.ts";

describe("外部编辑器的探测", () => {
  it("[DESKTOP-SETTINGS-07] 装了 VS Code 和 Cursor 就列出这两款，按固定顺序，没装的不列", async () => {
    const present = new Set([
      "/Applications/Cursor.app",
      "/Users/me/Applications/Visual Studio Code.app",
    ]);
    const found = await detectEditors("/Users/me", async (path) => present.has(path));
    expect(found.map((editor) => editor.id)).toEqual(["vscode", "cursor"]);
  });

  it("一款也没装是空列表", async () => {
    expect(await detectEditors("/Users/me", async () => false)).toEqual([]);
  });
});
