import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import { windowBackground } from "@runyard/tokens";
import { app, type BrowserWindow, nativeTheme, net, protocol } from "electron";
import { desktopChannels } from "../shared/desktop-bridge.ts";
import { APP_ORIGIN, APP_SCHEME, resolveAppFile } from "./app-protocol.ts";
import {
  connectToSupervisor,
  type DesktopRuntime,
  unavailableClient,
  withReconnect,
} from "./composition-root.ts";
import type { TerminalHooks } from "./controller-hosts.ts";
import { EditorFileService } from "./editor-files/file-service.ts";
import { createEditorRelease } from "./editor-release.ts";
import { runEditorSmoke } from "./editor-smoke.ts";
import { createFlushGates } from "./flush-gates.ts";
import {
  buildBootstrapInfo,
  closeKeepsAppAlive,
  currentPlatform,
} from "./integration/bootstrap-info.ts";
import {
  cliLauncherPath,
  defaultCliBinDir,
  installCliLink,
  uninstallCliLink,
} from "./integration/cli-link.ts";
import { createDesktopIpcHost, settingsDialogOwner } from "./integration/desktop-ipc-host.ts";
import { CLEAN_CHECK_INTERVAL_MS, createDockBadge } from "./integration/dock-badge.ts";
import { createMainWindow } from "./integration/main-window.ts";
import { createElectronSettingsHost } from "./integration/settings-host.ts";
import { createSettingsWindowHost } from "./integration/settings-window-host.ts";
import { claimSingleInstance, focusWindow } from "./integration/single-instance.ts";
import { ElectronSystemActions } from "./integration/system-actions.ts";
import { createSystemSettings } from "./integration/system-settings-host.ts";
import { createTerminalService, runTerminalSmokeFlow } from "./integration/terminal-host.ts";
import { resolveUserDataDir } from "./integration/user-data.ts";
import { createVueChannelHost } from "./integration/vue-channel-host.ts";
import { keepAliveAfterClose } from "./integration/window-lifecycle.ts";
import { registerBridgeHandlers } from "./ipc-handlers.ts";
import { type LibraryClient, LibraryController } from "./library-controller.ts";
import { LinkHandler } from "./links/link-handler.ts";
import { createLinkHost } from "./links/link-host.ts";
import { LinkInbox } from "./links/link-inbox.ts";
import { createMenuHost } from "./native-ui/menu-host.ts";
import {
  type DesktopArgs,
  parseDesktopArgs,
  resolveDesktopLocale,
  userArgv,
} from "./parse-args.ts";
import { ElectronPreviewHost } from "./preview-view.ts";
import { registerQuitFlow } from "./quit-coordinator.ts";
import { FileSessionStore } from "./session-store.ts";
import { SettingsController } from "./settings-controller.ts";
import { runSmoke } from "./smoke.ts";
import { TemplatesView } from "./templates-view.ts";
import { UpdateChecker } from "./updates/update-checker.ts";
import { FileUpdateStore } from "./updates/update-record.ts";

// 主进程入口（构建后在 apps/desktop/dist/main/index.mjs）。入口是 ES 模块，
// 不能在模块顶层 await app.whenReady()（互相等待，应用永远不就绪；决策记录 0005），所以用 then。

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..");

// 开发者诊断，只进启动它的终端，不是界面文字
function diagnostic(line: string): void {
  // i18n-allow: 开发时的终端诊断，从不显示给用户
  process.stderr.write(`${line}\n`);
}

// 自定义协议必须在 ready 之前登记
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;

// runyard:// 链接（macOS 的 open-url）：冷启动时事件早于 ready，所以监听挂在入口最前面，先排队（规格 DESKTOP-LINKS-05）。
// 协议的系统登记由打包完成（Info.plist），这里不向系统登记
const linkInbox = new LinkInbox();
app.on("open-url", (event, address) => {
  event.preventDefault();
  linkInbox.push(address);
});

function runtime(): DesktopRuntime {
  return app.isPackaged
    ? { kind: "packaged", resourcesPath: process.resourcesPath }
    : { kind: "source", moduleUrl: import.meta.url };
}

async function main(args: DesktopArgs): Promise<void> {
  const fallbackLocale = resolveDesktopLocale(args.lang, app.getPreferredSystemLanguages());

  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppFile(join(distDir, "renderer"), request.url);
    if (file === null) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });

  // 终端冒烟不开窗口也不连管理进程：只验证主进程终端服务、pty-host 和 node-pty 在这个构建里能工作
  if (args.terminalSmoke) {
    app.dock?.hide();
    app.exit(
      await runTerminalSmokeFlow({
        root: args.root,
        distDir,
        log: diagnostic,
        hold: args.terminalSmokeHold,
      }),
    );
    return;
  }

  // 冒烟自检不要在屏幕上出现任何东西
  if (args.smoke || args.editorSmoke) app.dock?.hide();
  const window = createMainWindow({
    preloadPath: join(distDir, "preload", "index.cjs"),
    show: !(args.smoke || args.editorSmoke),
    backgroundColor: (nativeTheme.shouldUseDarkColors
      ? windowBackground.dark
      : windowBackground.light
    ).library,
    platform: currentPlatform(),
  });
  mainWindow = window;
  if (args.editorSmoke) {
    // 编辑器冒烟不连管理进程、不注册界面通道，只检查编辑器资源在新策略下能加载
    app.exit(await runEditorSmoke(window, diagnostic));
    return;
  }
  keepAliveAfterClose(app, window, closeKeepsAppAlive(currentPlatform()));
  const preview = new ElectronPreviewHost(window);

  // 退出前、改名或移到废纸篓前问编辑器写入未保存的修改（规格 DESKTOP-EDITOR-27、28、75 至 78）
  const gates = createFlushGates(window);
  const { quit: quitGate, project: projectGate } = gates;
  let client: LibraryClient;
  let clientId = "";
  let close = (): void => {};
  try {
    const connected = await connectToSupervisor(runtime(), args.root);
    const reconnecting = withReconnect(connected, runtime(), args.root, () => controller.refresh());
    [client, clientId] = [reconnecting, connected.clientId];
    close = () => reconnecting.close();
    // 应用正常退出：先向管理进程道别，它会停掉这条连接名下的标签页运行（最多等 5 秒）
    registerQuitFlow(
      app,
      async () => {
        // 道别会停掉标签页的运行：先停止记录标签页，下次打开才知道哪些原来在运行
        controller.freezeSession();
        reconnecting.stopReconnecting();
        try {
          // 终端和运行一起收尾：⌘Q 后 5 秒内不留下 shell 和里面的命令（规格 DESKTOP-TERMINAL-30）
          await Promise.all([
            reconnecting.call("session.bye", {}),
            terminals.dispose(),
            language.dispose(),
          ]);
        } finally {
          close();
        }
      },
      () => quitGate.request(),
    );
  } catch (error) {
    diagnostic(`could not reach the supervisor: ${String(error)}`);
    client = unavailableClient(error);
    // 没有管理进程要道别，但编辑器里未保存的修改照样要在退出前写入
    registerQuitFlow(
      app,
      async () => {
        await Promise.all([terminals.dispose(), language.dispose()]);
      },
      () => quitGate.request(),
    );
  }

  // 语言和主题以设置里的为准；设置里没写语言时用启动参数或系统语言，主题选了“跟随系统”时用启动参数（开发用）
  const initial = await client.call("settings.get", {}).catch(() => undefined);
  const locale = initial?.language ?? fallbackLocale;
  const theme =
    initial === undefined || initial.theme === "system" ? (args.theme ?? "system") : initial.theme;
  // 让系统画的菜单、窗口外框和所有网页（含界面的 prefers-color-scheme）跟着选择走；
  // system 就是跟随系统（技术设计 §6.7“切换主题”第 3 步）
  nativeTheme.themeSource = theme;
  const system = new ElectronSystemActions();
  // 控制器和终端服务互相要用（标签页关闭要结束终端，终端要查项目文件夹）：控制器拿到的是下面这组薄的包装，
  // 终端服务在控制器之后建好，用到时才查
  const terminalHooks: TerminalHooks = {
    end: (id, reason) => terminals.end(id, reason),
    runningCommand: async (id) => (await terminals.foreground(id)).command,
  };
  const controller = new LibraryController({
    client,
    clientId,
    locale,
    preview,
    system,
    home: args.root ?? homedir(),
    dock: createDockBadge(app),
    isCloudSynced: (path) =>
      getPlatform(args.root === undefined ? {} : { home: absPath(args.root) }).paths.isCloudSynced(
        absPath(path),
      ),
    session: new FileSessionStore(join(app.getPath("userData"), "workspace-session.json")),
    terminals: terminalHooks,
  });
  const settingsWindow = createSettingsWindowHost({
    preloadPath: join(distDir, "preload", "index.cjs"),
    statePath: join(app.getPath("userData"), "settings-window.json"),
    platform: currentPlatform(),
    locale,
    onFocusChanged: (focused) => menu.setSettingsWindowActive(focused),
  });
  const ipcHost = createDesktopIpcHost(window, () => settingsWindow.controller.current);
  const terminals = createTerminalService({
    root: args.root,
    distDir,
    folderOf: (id) => controller.folderOf(id),
    emit: (event, payload) => ipcHost.send(desktopChannels.event, event, payload),
  });
  // 应用菜单（安装、重建、菜单动作转给界面都在 native-ui/menu-host.ts）；语言变了、切到或离开项目标签页都重建
  const menu = createMenuHost({
    window,
    settingsWindow: settingsWindow.controller,
    ipcHost,
    locale,
    platform: currentPlatform(),
    development: !app.isPackaged,
    version: app.getVersion(),
    openExternal: (url) => system.openExternalChecked(url),
    checkUpdates: () => updates.checkNow(),
  });
  menu.install();
  controller.onChange((state) => menu.setProjectTabActive(state.activeTab !== "library"));
  window.on("focus", () => void controller.checkProjectFolders());
  const home = args.root ?? homedir();
  const settings = new SettingsController({
    client,
    host: createElectronSettingsHost({
      home,
      window,
      dialogWindow: () => settingsDialogOwner(window, settingsWindow.controller.current),
      onLocaleChanged: (next) => {
        menu.install(next);
        settingsWindow.setLocale(next);
      },
    }),
    library: controller,
    home,
    fallbackLocale,
    ...createSystemSettings({
      client,
      runtime: runtime(),
      home,
      window,
      dialogWindow: () => settingsDialogOwner(window, settingsWindow.controller.current),
    }),
    ...(args.theme === undefined ? {} : { fallbackTheme: args.theme }),
    ...(initial === undefined ? {} : { initial }),
  });
  // 编辑器的文件服务：只认项目 id 加项目内相对路径，文件夹每次从当前列表里查
  const language = createVueChannelHost(home, distDir, controller, ipcHost);
  const files = new EditorFileService({
    platform: getPlatform(args.root === undefined ? {} : { home: absPath(args.root) }),
    projectFolder: (id) =>
      controller.getState().playgrounds.find((playground) => playground.id === id)?.path ?? null,
    onChange: (project, changes) => {
      ipcHost.send(desktopChannels.event, "files.changed", { project, changes });
      void controller.checkProjectFolders(project);
      void language.filesChanged(project, changes);
    },
  });
  app.once("will-quit", () => void files.dispose());
  // 改名、移到废纸篓前先写入未保存的修改、再放掉项目的文件监听（#265 的先后顺序）
  controller.onProjectRelease(createEditorRelease(files, projectGate, language));
  const links = new LinkHandler(
    createLinkHost({
      controller,
      focus: () => focusWindow(window),
      skipConfirmForBuiltin: async () => (await settings.get()).urlNewSkipConfirmForBuiltin,
    }),
  );
  preview.onAppLink = (address, playgroundId) => void links.handle(address, playgroundId);
  // 检查更新：从源码运行时不联网，只显示记录里已有的（canFetch）
  const updates = new UpdateChecker({
    current: app.getVersion(),
    fetch: globalThis.fetch,
    store: new FileUpdateStore(join(app.getPath("userData"), "update-check.json")),
    now: () => new Date(),
    enabled: async () => (await settings.get()).updateCheck,
    publish: (view) => {
      controller.chrome.update = view;
      controller.chrome.updateReady = true;
      controller.chrome.changed();
    },
    openExternal: (url) => system.openExternalChecked(url),
    canFetch: app.isPackaged && !args.smoke,
  });
  let currentLocale = locale;
  let currentTheme = theme;
  let updateCheckOn = initial?.updateCheck ?? true;
  settings.onChange((next) => {
    currentLocale = settings.localeOf(next);
    currentTheme = settings.themeOf(next);
    if (next.updateCheck === updateCheckOn) return;
    updateCheckOn = next.updateCheck;
    void updates.run();
  });
  registerBridgeHandlers(
    ipcHost,
    controller,
    () => ({
      ...buildBootstrapInfo(currentPlatform(), {
        locale: currentLocale,
        theme: currentTheme,
        reducedTransparency: nativeTheme.prefersReducedTransparency,
        highContrast: nativeTheme.shouldUseHighContrastColors,
      }),
      themeFallback: args.theme ?? "system",
    }),
    files,
    { reveal: (path) => system.revealInFileManager(path), open: (path) => system.openPath(path) },
    gates,
    settings,
    terminals,
    new TemplatesView({
      client,
      reveal: (path) => system.revealInFileManager(path),
      home: args.root ?? homedir(),
      refresh: controller.refresh,
    }),
    { links, updates },
    () => settingsWindow.controller.open(),
    language,
  );
  await window.loadURL(`${APP_ORIGIN}/`);
  await controller.start();
  await settings.start();
  // 冷启动时排着的链接在资源库读出来之后处理；之后的链接直接处理
  linkInbox.attach((address) => void links.handle(address));
  void updates.run();
  // 自动清理的调度在主进程（技术设计 §2.1）：启动时判断一次，之后定时；退出时停掉计时器
  void controller.chrome.clean.check();
  const cleanTimer = setInterval(
    () => void controller.chrome.clean.check(),
    CLEAN_CHECK_INTERVAL_MS,
  );
  app.once("will-quit", () => clearInterval(cleanTimer));

  if (args.smoke) {
    const code = await runSmoke(controller, window, preview, diagnostic);
    app.exit(code);
  }
}

// 命令行装到 PATH 或撤掉：在终端里做完就退出，不开窗口、不占单实例锁
async function runCliLink(request: NonNullable<DesktopArgs["cliLink"]>): Promise<number> {
  if (!app.isPackaged) {
    diagnostic("the command line can only be linked from an installed app");
    return 2;
  }
  const binDir = request.binDir ?? defaultCliBinDir();
  const result =
    request.action === "install"
      ? await installCliLink(binDir, cliLauncherPath(process.resourcesPath))
      : await uninstallCliLink(binDir);
  // i18n-allow: 终端里给开发者和脚本看的一行，--install-cli 没有界面
  await new Promise((done) => process.stdout.write(`${result.status} ${result.link}\n`, done));
  return result.status === "conflict" ? 9 : 0;
}

const parsed = parseDesktopArgs(userArgv(process.argv, process.defaultApp), process.env);
if (!parsed.ok) {
  diagnostic(`usage error: ${parsed.problem}`);
  app.exit(2);
} else {
  const { args } = parsed;
  // 数据目录必须在 ready 之前设好；单实例锁也按它算
  app.setPath(
    "userData",
    resolveUserDataDir({
      appData: app.getPath("appData"),
      packaged: app.isPackaged,
      root: args.root,
    }),
  );
  if (args.cliLink !== undefined) {
    void runCliLink(args.cliLink).then((code) => app.exit(code));
  } else if (claimSingleInstance(app, () => focusWindow(mainWindow))) {
    void app.whenReady().then(() => main(args));
  }
}
