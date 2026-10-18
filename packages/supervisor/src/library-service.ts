import { nextDefaultName } from "@runyard/core";
import { absPath } from "@runyard/platform";
import type { MethodParams, MethodResult, Owner, Playground } from "@runyard/protocol";
import { createAsyncMutex } from "./async-mutex.ts";
import type { LibraryContext } from "./library-context.ts";
import { methodFailure } from "./method-failure.ts";

// 资源库方法的实现。改动资源库的方法一律排队（一次一个），读-改-写不交错：
// 命令行和应用同时请求时不会有两个写入方交错着写同一个文件。

export interface LibraryService {
  start(): Promise<void>;
  list(filter: MethodParams<"playground.list">["filter"]): Promise<Playground[]>;
  get(ref: string): Promise<Playground>;
  create(params: MethodParams<"playground.create">): Promise<MethodResult<"playground.create">>;
  rename(ref: string, newName: string): Promise<Playground>;
  update(params: MethodParams<"playground.update">): Promise<Playground>;
  duplicate(params: MethodParams<"playground.duplicate">): Promise<Playground>;
  trash(ref: string): Promise<MethodResult<"playground.trash">>;
  relocate(ref: string, path: string): Promise<Playground>;
  forget(ref: string): Promise<void>;
  markOpened(ref: string): Promise<Playground>;
  rescan(): Promise<void>;
  due(): Promise<MethodResult<"clean.due">>;
  ackReminder(id: string): Promise<void>;
  keep(id: string): Promise<void>;
}

export function createLibraryService(ctx: LibraryContext): LibraryService {
  const mutex = createAsyncMutex();
  const { api, log } = ctx;

  async function rename(ref: string, newName: string): Promise<Playground> {
    let restart: { id: string; owner: Owner } | undefined;
    const playground = await mutex.run(async () => {
      const { library, root } = await ctx.open();
      const id = ctx.require(library, ref).entry.id;
      await library.rename(ref, newName, {
        isBusy: () => ctx.runs().isBusy(id),
        beforeMove: async () => {
          const owner = ctx.runs().activePlaygrounds().has(id) ? ctx.runs().ownerOf(id) : undefined;
          if (owner !== undefined) restart = { id, owner };
          await ctx.releaseOrder(id, "rename");
        },
      });
      // 改名：大小的结果按 id 保留，监听换到新路径
      ctx.syncSizes(library, root);
      return ctx.changed(library, id);
    });
    // 第 6 步：改名前在运行的，用新名称再启动，持有者不变。不占着排队的锁；
    // 启动失败不让已经完成的改名变成失败
    if (restart !== undefined) {
      await ctx
        .runs()
        .start(restart.id, restart.owner)
        .catch((error: unknown) => log(`restart after rename failed: ${String(error)}`));
    }
    return playground;
  }

  const create: LibraryService["create"] = (params) =>
    mutex.run(async () => {
      const { library, root } = await ctx.open();
      const catalog = ctx.seams().templates;
      if (catalog === undefined) {
        throw methodFailure("TEMPLATE_NOT_FOUND", { template: params.template }, "no templates");
      }
      // 默认名的规则同 core 的创建（只看根目录里现存的文件夹）；模板展开要用到名称，所以这里先定
      const name =
        params.name ??
        nextDefaultName(params.template, await api.platform.fs.listDirs(absPath(root)));
      const seeded = await catalog.seed({
        template: params.template,
        name,
        vars: params.vars ?? {},
      });
      // 设置里的包管理器在创建时写进项目，之后安装依赖按它选（规格 DESKTOP-SETTINGS-32）；
      // “自动”不记录，安装时按运行器声明的顺序找可用的
      const preferred = (await api.readSettings()).packageManager;
      const seed =
        preferred === "auto" || seeded.packageManager !== undefined
          ? seeded
          : { ...seeded, packageManager: preferred };
      const result = await library.create(seed, {
        name,
        ...(params.note !== undefined ? { note: params.note } : {}),
        ...(params.autoClean !== undefined ? { autoCleanDays: params.autoClean } : {}),
        ...(params.ifExists !== undefined ? { ifExists: params.ifExists } : {}),
        createdBy: params.createdBy,
      });
      const item = ctx.require(library, result.entry.id);
      ctx.remember(item.entry.id, result.file);
      ctx.syncSizes(library, root);
      const playground = await ctx.describe(library, item);
      if (result.created) api.publish("playground.added", playground);
      return {
        playground,
        created: result.created,
        ...(result.notices.length > 0 ? { notices: [...result.notices] } : {}),
      };
    });

  const update: LibraryService["update"] = (params) =>
    mutex.run(async () => {
      const { library } = await ctx.open();
      const id = ctx.require(library, params.playground).entry.id;
      const { note, scriptAutoRun, requestAutoResend } = params;
      if (note !== undefined || scriptAutoRun !== undefined || requestAutoResend !== undefined) {
        await library.update(id, {
          ...(note !== undefined ? { note } : {}),
          ...(scriptAutoRun !== undefined ? { scriptAutoRun } : {}),
          ...(requestAutoResend !== undefined ? { requestAutoResend } : {}),
        });
      }
      if (params.autoClean !== undefined) await library.setAutoClean(id, params.autoClean);
      return ctx.changed(library, id);
    });

  // 副本和新建一样登记并发 playground.added；不启动运行，原项目的运行不受影响
  const duplicate: LibraryService["duplicate"] = (params) =>
    mutex.run(async () => {
      const { library, root } = await ctx.open();
      const result = await library.duplicate(params.playground, {
        ...(params.name !== undefined ? { name: params.name } : {}),
      });
      const item = ctx.require(library, result.entry.id);
      ctx.remember(item.entry.id, result.file);
      ctx.syncSizes(library, root);
      const playground = await ctx.describe(library, item);
      api.publish("playground.added", playground);
      return playground;
    });

  return {
    async start() {
      try {
        const { library } = await ctx.open();
        await ctx.publishScan(library, await library.rescan());
      } catch (error) {
        log(`startup library scan failed: ${String(error)}`);
      }
    },
    async list(filter) {
      const { library } = await ctx.open();
      const active = ctx.runs().activePlaygrounds();
      const all = await Promise.all(library.list().map((item) => ctx.describe(library, item)));
      return all.filter(
        (playground) =>
          (filter?.running === undefined || active.has(playground.id) === filter.running) &&
          (filter?.createdBy === undefined || playground.createdBy.kind === filter.createdBy),
      );
    },
    async get(ref) {
      const { library } = await ctx.open();
      return ctx.describe(library, ctx.require(library, ref));
    },
    create,
    rename,
    update,
    duplicate,
    trash: (ref) =>
      mutex.run(async () => {
        const { library, root } = await ctx.open();
        const id = ctx.require(library, ref).entry.id;
        const outcome = await library.trash(ref, {
          beforeMove: () => ctx.releaseOrder(id, "trash"),
        });
        ctx.forgetSeen(id);
        ctx.syncSizes(library, root);
        api.publish("playground.removed", { playgroundId: id });
        return { trashed: true, deletedRegenerable: [...outcome.result.removedDirectly] };
      }),
    relocate: (ref, path) =>
      mutex.run(async () => {
        const { library, root } = await ctx.open();
        const entry = await library.relocate(ref, absPath(path));
        ctx.syncSizes(library, root);
        // 重新定位到另一个文件夹：内容是另一份，重算（路径变了，对账只换监听）
        ctx.sizes.refresh(entry.id);
        return ctx.changed(library, entry.id);
      }),
    forget: (ref) =>
      mutex.run(async () => {
        const { library, root } = await ctx.open();
        const item = await library.forget(ref);
        ctx.forgetSeen(item.entry.id);
        ctx.syncSizes(library, root);
        api.publish("playground.removed", { playgroundId: item.entry.id });
      }),
    markOpened: (ref) =>
      mutex.run(async () => {
        const { library } = await ctx.open();
        const id = ctx.require(library, ref).entry.id;
        await library.markOpened(id);
        return ctx.changed(library, id);
      }),
    rescan: () =>
      mutex.run(async () => {
        const { library } = await ctx.open();
        await ctx.publishScan(library, await library.rescan());
      }),
    // checkAutoClean 会把“正在使用而顺延”记进索引，所以也排队
    due: () =>
      mutex.run(async () => {
        const { library } = await ctx.open();
        const verdict = await library.checkAutoClean(ctx.runs().activePlaygrounds());
        return { remind: [...verdict.remind], clean: [...verdict.clean] };
      }),
    ackReminder: (id) =>
      mutex.run(async () => {
        const { library } = await ctx.open();
        await library.ackReminder(id);
      }),
    keep: (id) =>
      mutex.run(async () => {
        const { library } = await ctx.open();
        const item = await library.keep(id);
        await ctx.changed(library, item.entry.id);
      }),
  };
}
