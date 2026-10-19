import { normalize } from "node:path";
import { type LibraryItem, PlaygroundLibrary, type ScanReport } from "@runyard/core";
import { absPath } from "@runyard/platform";
import type { Playground, PlaygroundFile } from "@runyard/protocol";
import { createDiskUsageService, type DiskUsageService } from "./disk-usage-service.ts";
import type { LibrarySeams } from "./library-seams.ts";
import { methodFailure } from "./method-failure.ts";
import { fileFrom, toPlayground } from "./playground-view.ts";
import { createReleaseCoordinator } from "./release-coordinator.ts";
import { noRuns, type RunsView } from "./runs-view.ts";
import { createSettingsStore } from "./settings-store.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 资源库方法共用的现场：打开资源库（跟随设置里的根目录）、把索引项合成协议里的 Playground、
// 发事件、改名与移到废纸篓共用的释放顺序。

export interface LibraryContext {
  readonly api: SupervisorApi;
  readonly settings: ReturnType<typeof createSettingsStore>;
  readonly release: ReturnType<typeof createReleaseCoordinator>;
  readonly log: (line: string) => void;
  /** 项目的磁盘占用（内存缓存加后台计算，disk-usage-service.ts） */
  readonly sizes: DiskUsageService;
  /** 资源库的项目表变了：让大小服务对账（新项目排队、改名保留、移除清掉） */
  syncSizes(library: PlaygroundLibrary, root: ReturnType<typeof absPath>): void;
  seams(): LibrarySeams;
  runs(): RunsView;
  /** 资源库和它对应的根目录；设置里的 libraryRoot 变了就换一个新的 */
  open(): Promise<{ library: PlaygroundLibrary; root: ReturnType<typeof absPath> }>;
  describe(library: PlaygroundLibrary, item: LibraryItem): Promise<Playground>;
  remember(id: string, file: PlaygroundFile): void;
  forgetSeen(id: string): void;
  require(library: PlaygroundLibrary, ref: string): LibraryItem;
  /** 项目变了：重新合成并发 playground.changed */
  changed(library: PlaygroundLibrary, id: string): Promise<Playground>;
  publishScan(library: PlaygroundLibrary, report: ScanReport): Promise<void>;
  /** 技术设计 §4.3 第 1 到 4 步：停止，请所有客户端释放句柄并等回报（最多 3 秒） */
  releaseOrder(id: string, reason: "rename" | "trash"): Promise<void>;
}

export function createLibraryContext(
  api: SupervisorApi,
  seams: () => LibrarySeams,
  log: (line: string) => void,
): LibraryContext {
  const { platform, clock } = api;
  const now = () => clock.now();
  const settings = createSettingsStore({ platform, now, log });
  const release = createReleaseCoordinator(api, log);
  const runs = () => seams().runs ?? noRuns;
  // 最近一次读到的 playground.json：文件夹找不到时，事件和列表还靠它给出完整的项目
  const seen = new Map<string, PlaygroundFile>();
  const publishChanged = (id: string) => {
    void (async () => {
      const { library } = await context.open();
      const item = library.find(id);
      if (item !== undefined)
        api.publish("playground.changed", await context.describe(library, item));
    })().catch((error: unknown) => log(`publishing size failed: ${String(error)}`));
  };
  const sizes = createDiskUsageService(api, { onChange: publishChanged, log });
  let opened: { rootText: string; value: ReturnType<LibraryContext["open"]> } | undefined;

  const context: LibraryContext = {
    api,
    settings,
    release,
    log,
    sizes,
    syncSizes(library, root) {
      sizes.sync(
        root,
        library.list().map((item) => ({
          id: item.entry.id,
          path: absPath(item.entry.path),
          missing: item.entry.missingSince !== undefined,
        })),
      );
    },
    seams,
    runs,
    async open() {
      const { libraryRoot } = await settings.get();
      if (opened === undefined || opened.rootText !== libraryRoot) {
        // 归一化分隔符和重复的斜杠：设置里的路径可能是手写的
        const root = absPath(normalize(libraryRoot));
        const library = PlaygroundLibrary.open({
          root,
          platform,
          // 没有 #36 的端口分配时，新项目没有端口
          ports: {
            allocate: (request) => seams().ports?.allocate(request) ?? Promise.resolve(null),
          },
          now,
        });
        const value = library.then((lib) => ({ library: lib, root }));
        const entry = { rootText: libraryRoot, value };
        opened = entry;
        // 打开失败不留着失败的结果，下一次请求能重试
        value.catch(() => {
          if (opened === entry) opened = undefined;
        });
      }
      return opened.value;
    },
    async describe(library, item) {
      const file = fileFrom(await library.readFile(item), seen.get(item.entry.id), item);
      seen.set(item.entry.id, file);
      return toPlayground(
        item,
        file,
        seams().templates?.runnerKind(file.runner),
        sizes.get(item.entry.id),
      );
    },
    remember: (id, file) => void seen.set(id, file),
    forgetSeen: (id) => void seen.delete(id),
    require(library, ref) {
      const item = library.find(ref);
      if (item === undefined) {
        throw methodFailure("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
      }
      return item;
    },
    async changed(library, id) {
      const item = library.find(id);
      if (item === undefined) throw methodFailure("INTERNAL", {}, `playground ${id} vanished`);
      const playground = await context.describe(library, item);
      api.publish("playground.changed", playground);
      return playground;
    },
    async publishScan(library, report) {
      for (const change of report.changes) {
        const item = library.find(change.id);
        if (item === undefined) continue;
        const playground = await context.describe(library, item);
        const added = change.kind === "added" || change.kind === "copied";
        api.publish(
          added
            ? "playground.added"
            : change.kind === "missing"
              ? "playground.missing"
              : "playground.changed",
          playground,
        );
      }
      for (const skip of report.skipped) log(`scan skipped ${skip.path}: ${skip.reason}`);
      const { root } = await context.open();
      context.syncSizes(library, root);
    },
    async releaseOrder(id, reason) {
      await runs().stop(id);
      await release.request(id, reason);
      await sizes.pause(id);
    },
  };
  return context;
}
