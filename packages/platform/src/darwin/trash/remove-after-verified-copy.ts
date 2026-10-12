import { randomBytes } from "node:crypto";
import { access, chmod, constants, lstat, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { platformError } from "../../platform-error.ts";
import type { EntryKind } from "../../posix/fs/rename-no-replace.ts";
import { placeInTrash } from "./reserve-in-trash.ts";
import type { TrashOps } from "./trash-deps.ts";
import { compareTrees } from "./verify-copy.ts";

// 目标卷上没有可用的废纸篓目录时的兜底（决策记录 0010 第 6.1 节）：
//   复制到 ~/.Trash 下的临时名 -> 核对复制完整 -> 改成最终名字放进废纸篓 -> 才删原件。
// 这是整个平台层里唯一一处“核验过复制之后删除原件”的地方，也是 no-permanent-delete 检查
// 唯一放行递归删除的文件（tooling/checks/no-permanent-delete.ts）。别的地方想删用户的东西，只有 fs.trash。
//
// 任何一步失败：原件原样保留，复制出来的半成品（我们自己建的临时副本）清掉，抛 TRASH_UNAVAILABLE。
// 不保留扩展属性（fs.cp 不带）；权限由 restoreModes 补回。这个损失记在决策记录 0010，只在没有废纸篓的卷上发生。

/** fs.cp 会丢只读目录的权限（K9 实测）：复制完按原件逐个补回，最深的先改，免得父目录先变只读 */
async function restoreModes(from: string, to: string): Promise<void> {
  const info = await lstat(from);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    for (const name of await readdir(from)) await restoreModes(join(from, name), join(to, name));
  }
  // 副本里少了这一项不在这里判断：交给 compareTrees，它是唯一决定能不能删原件的关卡
  await chmod(to, info.mode & 0o7777).catch(() => undefined);
}

/**
 * 只读目录里的文件删不掉（Go 的模块缓存就是只读的）。目录放开写权限再删；只用于马上要删的树：
 * 自己的临时副本，和已经有完整副本的原件
 */
async function makeDirsWritable(path: string): Promise<void> {
  const info = await lstat(path).catch(() => null);
  if (info === null || !info.isDirectory()) return;
  await chmod(path, info.mode | 0o700).catch(() => undefined);
  for (const name of await readdir(path).catch(() => [])) await makeDirsWritable(join(path, name));
}

async function removeCopy(temp: string): Promise<void> {
  await makeDirsWritable(temp);
  // delete-allow: 只删本次自己建的临时副本（~/.Trash 下的 .runyard-copying-*），不是原件
  await rm(temp, { recursive: true, force: true }).catch(() => undefined);
}

export async function trashByVerifiedCopy(
  item: string,
  kind: EntryKind,
  trashDir: string,
  ops: TrashOps,
  now: () => Date,
): Promise<void> {
  const name = basename(item);
  const fail = (debug: string) => platformError("TRASH_UNAVAILABLE", { name }, debug);
  const temp = join(trashDir, `.runyard-copying-${randomBytes(6).toString("hex")}`);

  // 原件的上级目录不可写就一定删不掉原件：先于复制拒绝，免得复制了几个 G 才发现
  try {
    await access(dirname(item), constants.W_OK);
  } catch {
    throw fail("the folder containing the original is not writable, original kept");
  }

  try {
    await ops.copyTree(item, temp);
    await restoreModes(item, temp);
    const problem = await compareTrees(item, temp);
    if (problem !== undefined) throw new Error(`copy is not complete (${problem})`);
  } catch (error) {
    await removeCopy(temp);
    throw fail(`copy to trash failed, original kept: ${String(error)}`);
  }

  try {
    await placeInTrash(temp, name, kind, trashDir, ops, now);
  } catch (error) {
    await removeCopy(temp);
    throw fail(`could not name the copy in the trash, original kept: ${String(error)}`);
  }

  try {
    await makeDirsWritable(item);
    // delete-allow: 平台层唯一的“核验过复制之后删除原件”：副本已完整地在废纸篓里（上面核对过）
    await rm(item, { recursive: true });
  } catch (error) {
    // 副本是完整的、已在废纸篓里；原件可能被删掉一部分。如实报告，不假装成功
    throw fail(`copied to trash but the original could not be fully removed: ${String(error)}`);
  }
}
