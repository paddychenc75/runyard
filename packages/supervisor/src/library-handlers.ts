import type { HandlerMap } from "./dispatch.ts";
import type { LibraryContext } from "./library-context.ts";
import type { LibraryService } from "./library-service.ts";

// 资源库、设置、自动清理的方法登记。参数已按登记表校验；失败抛 MethodFailure 或 core 的 LibraryError。

export function createLibraryHandlers(ctx: LibraryContext, service: LibraryService): HandlerMap {
  return {
    "playground.list": ({ filter }) => service.list(filter),
    "playground.get": ({ playground }) => service.get(playground),
    "playground.create": (params) => service.create(params),
    "playground.rename": ({ playground, newName }) => service.rename(playground, newName),
    "playground.update": (params) => service.update(params),
    "playground.duplicate": (params) => service.duplicate(params),
    "playground.trash": ({ playground }) => service.trash(playground),
    "playground.relocate": ({ playground, path }) => service.relocate(playground, path),
    "playground.forget": async ({ playground }) => {
      await service.forget(playground);
      return {};
    },
    "playground.markOpened": ({ playground }) => service.markOpened(playground),
    "playground.released": ({ playgroundId }, { session }) => {
      ctx.release.released(session.id, playgroundId);
      return {};
    },
    "library.rescan": async () => {
      await service.rescan();
      return {};
    },
    "clean.due": () => service.due(),
    "clean.ackReminder": async ({ playgroundId }) => {
      await service.ackReminder(playgroundId);
      return {};
    },
    "clean.keep": async ({ playgroundId }) => {
      await service.keep(playgroundId);
      return {};
    },
    "settings.get": () => ctx.settings.get(),
    "settings.set": async (patch) => {
      const settings = await ctx.settings.set(patch);
      ctx.api.publish("settings.changed", {});
      return settings;
    },
  };
}
