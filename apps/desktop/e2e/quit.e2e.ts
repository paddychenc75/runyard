import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

interface Status {
  playgrounds: { name: string; state: string; owner: string | null }[];
}

test("⌘Q：停掉标签页持有的运行，保留命令行起的运行", async ({ launch }) => {
  const runyard = await launch();
  const { page } = runyard;
  // 一个由标签页持有（在应用里打开就运行），一个由命令行持有
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/Running :\d+/);
  await runyard.cli("new", "html", "from-cli", "--run");
  const before = (await runyard.cli("status")) as Status;
  expect(before.playgrounds.map((p) => [p.name, p.owner])).toEqual(
    expect.arrayContaining([
      ["html-1", "tab"],
      ["from-cli", "cli"],
    ]),
  );

  await runyard.quit();

  const after = (await runyard.cli("status")) as Status;
  const byName = new Map(after.playgrounds.map((p) => [p.name, p]));
  expect(byName.get("html-1")?.state).toBe("stopped");
  expect(byName.get("from-cli")).toMatchObject({ state: "ready", owner: "cli" });
});
