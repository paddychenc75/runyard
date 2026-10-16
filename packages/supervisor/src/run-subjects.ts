import type { LibraryItem, RunSubject, StartRequest } from "@runyard/core";
import { type AbsPath, absPath, joinPath, posixRelPath } from "@runyard/platform";
import {
  type PlaygroundFile,
  type Runner,
  readVersionedText,
  runnerFileFormat,
} from "@runyard/protocol";
import { methodFailure } from "./method-failure.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 运行要用的“项目此刻的事实”：资源库里的一项、它的 playground.json、模板那一侧的运行器。
// 查不到、文件夹找不到、文件是更新版本写的，都在这里变成协议错误。

export interface ResolvedPlayground {
  readonly item: LibraryItem;
  readonly file: PlaygroundFile;
  readonly runner: Runner;
}

export interface RunSubjects {
  /** 按名称、id 或路径找项目；失败抛 PLAYGROUND_NOT_FOUND、FOLDER_MISSING、DATA_FROM_NEWER_VERSION、RUN_FAILED */
  lookup(ref: string): Promise<ResolvedPlayground>;
  /** 只认项目，不看文件夹（已结束的运行记录不依赖文件夹还在） */
  item(ref: string): Promise<LibraryItem>;
  /** 给准备阶段（core 的 RunPreparer）用 */
  subjectOf(request: StartRequest): Promise<RunSubject>;
}

export function createRunSubjects(api: SupervisorApi, runnersDir: AbsPath): RunSubjects {
  const { platform } = api;

  async function readRunner(id: string, name: string): Promise<Runner> {
    const text = /^[a-z0-9][a-z0-9-]*$/.test(id)
      ? await platform.fs.readText(joinPath(runnersDir, posixRelPath(`${id}/runner.json`)))
      : null;
    const read = text === null ? undefined : readVersionedText(runnerFileFormat, text);
    if (read?.status !== "ok") {
      throw methodFailure("RUN_FAILED", { name }, `runner ${id} is missing or invalid`);
    }
    return read.value;
  }

  async function itemOf(ref: string): Promise<LibraryItem> {
    const found = (await api.openLibrary()).find(ref);
    if (found === undefined) {
      throw methodFailure("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    }
    return found;
  }

  async function lookup(ref: string): Promise<ResolvedPlayground> {
    const library = await api.openLibrary();
    const item = await itemOf(ref);
    const { name } = item;
    if (
      item.entry.missingSince !== undefined ||
      !(await platform.fs.exists(absPath(item.entry.path)))
    ) {
      throw methodFailure("FOLDER_MISSING", { name }, `folder of ${name} is missing`);
    }
    const read = await library.readFile(item);
    if (read.status === "newer") {
      throw methodFailure(
        "DATA_FROM_NEWER_VERSION",
        { file: "playground.json", found: read.found, supported: read.supported },
        "playground.json was written by a newer version",
      );
    }
    if (read.status !== "ok") {
      throw methodFailure("RUN_FAILED", { name }, `playground.json of ${name} is ${read.status}`);
    }
    return { item, file: read.value, runner: await readRunner(read.value.runner, name) };
  }

  async function subjectOf(request: StartRequest): Promise<RunSubject> {
    const { item, file, runner } = await lookup(request.playgroundId);
    const library = await api.openLibrary();
    const others = new Set<number>();
    for (const other of library.list()) {
      if (other.entry.id !== item.entry.id && other.entry.port !== undefined) {
        others.add(other.entry.port);
      }
    }
    return {
      folder: absPath(item.entry.path),
      runner,
      // playground.json 里只存版本范围；准备阶段要的 Requires 是 { 工具: { version } }
      requires: Object.fromEntries(
        Object.entries(file.requires).map(([tool, version]) => [tool, { version }]),
      ),
      ...(file.entry === undefined ? {} : { entry: file.entry }),
      ...(item.entry.port === undefined ? {} : { registeredPort: item.entry.port }),
      otherRegisteredPorts: others,
      ...(file.packageManager === undefined ? {} : { packageManager: file.packageManager }),
    };
  }

  return { item: itemOf, lookup, subjectOf };
}
