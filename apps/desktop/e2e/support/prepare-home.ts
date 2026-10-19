import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface E2eHome {
  home: string;
  root: string;
}
export type PrepareE2eHome = (paths: E2eHome) => void | Promise<void>;

/** 只用于 launch 刚创建的临时 HOME；先阻止默认更新联网，再让专门用例覆盖记录。 */
export async function prepareE2eHome(
  paths: E2eHome,
  prepare?: PrepareE2eHome,
  now = new Date(),
): Promise<void> {
  const directory = join(paths.root, ".runyard", "app-data");
  await mkdir(directory, { recursive: true });
  const pad = (value: number) => String(value).padStart(2, "0");
  const checkedOn = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  try {
    await writeFile(
      join(directory, "update-check.json"),
      JSON.stringify({ checkedOn, latest: null, dismissed: null }),
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await prepare?.(paths);
}
