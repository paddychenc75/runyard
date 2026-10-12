import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMessagesTypes, GENERATED_FILE } from "./build.ts";

const packageDir = join(import.meta.dirname, "..");

describe("i18n:build", () => {
  it("generated/messages.d.ts 与中文文案一致；文案改了要重新运行 pnpm i18n:build", () => {
    const committed = readFileSync(join(packageDir, GENERATED_FILE), "utf8");
    expect(committed).toBe(buildMessagesTypes(packageDir));
  });
});
