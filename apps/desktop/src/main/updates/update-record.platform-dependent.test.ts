import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FileUpdateStore } from "./update-record.ts";

it("[DESKTOP-NOTIFICATIONS-04] 兼容旧更新记录，收起字段不变且新处理字段为空", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ry-update-record-"));
  const file = join(dir, "update-check.json");
  const old = {
    checkedOn: "2026-10-19",
    latest: { version: "0.3.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
    dismissed: "0.3.0",
  };
  await writeFile(file, JSON.stringify(old));
  const store = new FileUpdateStore(file);
  expect(await store.load()).toEqual({ ...old, handledVersion: null });
});
it("[DESKTOP-NOTIFICATIONS-06] 保存并重读处理版本，不覆盖旧收起字段", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ry-update-record-"));
  const file = join(dir, "update-check.json");
  const store = new FileUpdateStore(file);
  const record = {
    checkedOn: "2026-10-19",
    latest: { version: "0.4.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
    dismissed: "0.3.0",
    handledVersion: "0.4.0",
  };
  await store.save(record);
  expect(await store.load()).toEqual(record);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual(record);
});
