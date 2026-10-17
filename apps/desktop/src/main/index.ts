import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import { windowBackground } from "@runyard/tokens";
import { app, type BrowserWindow, ipcMain, Menu, nativeTheme, net, protocol } from "electron";
import { desktopChannels } from "../shared/desktop-bridge.ts";
import { APP_ORIGIN, APP_SCHEME, resolveAppFile } from "./app-protocol.ts";
import { connectToSupervisor, type DesktopRuntime, unavailableClient } from "./composition-root.ts";
import { EditorFileService } from "./editor-files/file-service.ts";
import { runEditorSmoke } from "./editor-smoke.ts";
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
import { createMainWindow } from "./integration/main-window.ts";
import { createElectronSettingsHost } from "./integration/settings-host.ts";
import { claimSingleInstance, focusWindow } from "./integration/single-instance.ts";
import { ElectronSystemActions } from "./integration/system-actions.ts";
import { resolveUserDataDir } from "./integration/user-data.ts";
import { keepAliveAfterClose } from "./integration/window-lifecycle.ts";
import {
  type IpcHost,
  registerBridgeHandlers,
  requestPicker,
  requestSidebarToggle,
} from "./ipc-handlers.ts";
import { type LibraryClient, LibraryController } from "./library-controller.ts";
import { buildAppMenu } from "./native-ui/app-menu.ts";
import {
  type DesktopArgs,
  parseDesktopArgs,
  resolveDesktopLocale,
  userArgv,
} from "./parse-args.ts";
import { ElectronPreviewHost } from "./preview-view.ts";
import { registerQuitFlow } from "./quit-coordinator.ts";
import { QuitFlushGate } from "./quit-flush-gate.ts";
import { SettingsController } from "./settings-controller.ts";
import { runSmoke } from "./smoke.ts";

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

  // 退出前问编辑器（规格 DESKTOP-EDITOR-27、28）；渲染进程没了就不问
  const quitGate = new QuitFlushGate((id) => {
    if (window.isDestroyed()) return false;
    window.webContents.send(desktopChannels.event, "app.quitRequested", { id });
    return true;
  });
  window.webContents.on("render-process-gone", () => quitGate.abandon());
  let client: LibraryClient;
  let clientId = "";
  let close = (): void => {};
  try {
    const connected = await connectToSupervisor(runtime(), args.root);
    client = connected.client;
    clientId = connected.clientId;
    close = () => connected.client.close();
    // 应用正常退出：先向管理进程道别，它会停掉这条连接名下的标签页运行（最多等 5 秒）
    registerQuitFlow(
      app,
      async () => {
        try {
          await connected.client.call("session.bye", {});
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
      async () => {},
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
  const controller = new LibraryController({
    client,
    clientId,
    locale,
    preview,
    system,
    home: args.root ?? homedir(),
  });
  const ipcHost: IpcHost = {
    handle: (channel, handler) =>
      ipcMain.handle(channel, (event, ...rest) =>
        handler({ url: event.senderFrame?.url ?? "" }, ...rest),
      ),
    handleSync: (channel, handler) =>
      ipcMain.on(channel, (event) => {
        try {
          event.returnValue = handler({ url: event.senderFrame?.url ?? "" });
        } catch {
          // 发送者不可信：返回 null，界面拿不到启动信息
          event.returnValue = null;
        }
      }),
    send: (channel, name, payload) => {
      if (!window.isDestroyed()) window.webContents.send(channel, name, payload);
    },
  };
  // 应用菜单：⌘N 打开模板选择器（焦点在预览视图里也有效）；语言变了重建
  const installMenu = (menuLocale: typeof locale): void =>
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildAppMenu({
          locale: menuLocale,
          platform: currentPlatform(),
          onNew: () => requestPicker(ipcHost),
          onToggleSidebar: () => requestSidebarToggle(ipcHost),
        }),
      ),
    );
  installMenu(locale);
  const home = args.root ?? homedir();
  const settings = new SettingsController({
    client,
    host: createElectronSettingsHost({ home, window, onLocaleChanged: installMenu }),
    library: controller,
    home,
    fallbackLocale,
    ...(args.theme === undefined ? {} : { fallbackTheme: args.theme }),
    ...(initial === undefined ? {} : { initial }),
  });
  // 编辑器的文件服务：只认项目 id 加项目内相对路径，文件夹每次从当前列表里查
  const files = new EditorFileService({
    platform: getPlatform(args.root === undefined ? {} : { home: absPath(args.root) }),
    projectFolder: (id) =>
      controller.getState().playgrounds.find((playground) => playground.id === id)?.path ?? null,
    onChange: (project, changes) =>
      ipcHost.send(desktopChannels.event, "files.changed", { project, changes }),
  });
  app.once("will-quit", () => void files.dispose());
  registerBridgeHandlers(
    ipcHost,
    controller,
    buildBootstrapInfo(currentPlatform(), {
      locale,
      theme,
      reducedTransparency: nativeTheme.prefersReducedTransparency,
      highContrast: nativeTheme.shouldUseHighContrastColors,
    }),
    files,
    { reveal: (path) => system.revealInFileManager(path), open: (path) => system.openPath(path) },
    quitGate,
    settings,
  );
  await window.loadURL(`${APP_ORIGIN}/`);
  await controller.start();
  await settings.start();

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
