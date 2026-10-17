import type { LibraryController } from "../library-controller.ts";
import type { LinkHost } from "./link-handler.ts";

// 把链接处理接到资源库控制器上：项目和模板从控制器当前的状态里查，提示和待确认请求经它的 chrome 推给界面。

export interface LinkHostOptions {
  controller: LibraryController;
  focus(): void;
  skipConfirmForBuiltin(): Promise<boolean>;
  now?: () => number;
}

export function createLinkHost(options: LinkHostOptions): LinkHost {
  const { controller } = options;
  return {
    playgrounds: () => controller.getState().playgrounds,
    templates: () => controller.getState().templates,
    libraryRoot: () => controller.getState().libraryRoot,
    focus: options.focus,
    openProject: (id) => controller.openProject(id),
    create: (request) => controller.create(request),
    skipConfirmForBuiltin: options.skipConfirmForBuiltin,
    notify: (code, value) => {
      controller.chrome.notices.addLink(code, value);
      controller.chrome.changed();
    },
    pendingChanged: (view) => {
      controller.chrome.linkConfirm = view;
      controller.chrome.changed();
    },
    now: options.now ?? Date.now,
  };
}
