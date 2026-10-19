import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepareE2eHome } from "./prepare-home.ts";

it("测试隔离先写当天无更新缓存，再执行用例prepare，保留用例覆盖的数据", async () => {
  const home = await mkdtemp(join(tmpdir(), "rye-prepare-"));
  const root = join(home, "r");
  const file = join(root, ".runyard", "app-data", "update-check.json");
  await prepareE2eHome(
    { home, root },
    async (paths) => {
      expect(paths).toEqual({ home, root });
      expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
        checkedOn: "2026-10-19",
        latest: null,
      });
      await writeFile(
        file,
        JSON.stringify({ checkedOn: "2000-01-01", latest: { version: "99.0.0" } }),
      );
    },
    new Date(2026, 9, 19, 10),
  );
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    checkedOn: "2000-01-01",
    latest: { version: "99.0.0" },
  });
});
it("临时根目录已有更新测试记录时，默认缓存不覆盖它", async () => {
  const home = await mkdtemp(join(tmpdir(), "rye-prepare-"));
  const root = join(home, "r");
  const file = join(root, ".runyard", "app-data", "update-check.json");
  await prepareE2eHome({ home, root }, () => writeFile(file, "existing-test-data"));
  await prepareE2eHome({ home, root });
  expect(await readFile(file, "utf8")).toBe("existing-test-data");
});
