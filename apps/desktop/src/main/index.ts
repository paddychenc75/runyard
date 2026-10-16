import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, type BrowserWindow, ipcMain, nativeTheme, net, protocol } from "electron";
import { APP_ORIGIN, APP_SCHEME, resolveAppFile } from "./app-protocol.ts";
import { connectToSupervisor, unavailableClient } from "./composition-root.ts";
import {
  buildBootstrapInfo,
  closeKeepsAppAlive,
  currentPlatform,
} from "./integration/bootstrap-info.ts";
import { createMainWindow, PLACEHOLDER_BACKGROUND } from "./integration/main-window.ts";
import { claimSingleInstance, focusWindow } from "./integration/single-instance.ts";
import { resolveUserDataDir } from "./integration/user-data.ts";
import { keepAliveAfterClose } from "./integration/window-lifecycle.ts";
import { registerBridgeHandlers } from "./ipc-handlers.ts";
import { type LibraryClient, LibraryController } from "./library-controller.ts";
import { type DesktopArgs, parseDesktopArgs, resolveDesktopLocale } from "./parse-args.ts";
import { ElectronPreviewHost } from "./preview-view.ts";
import { QuitCoordinator } from "./quit-coordinator.ts";
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

async function main(args: DesktopArgs): Promise<void> {
  const locale = resolveDesktopLocale(args.lang, app.getPreferredSystemLanguages());

  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppFile(join(distDir, "renderer"), request.url);
    if (file === null) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });

  // 冒烟自检不要在屏幕上出现任何东西
  if (args.smoke) app.dock?.hide();
  const window = createMainWindow({
    preloadPath: join(distDir, "preload", "index.cjs"),
    show: !args.smoke,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? PLACEHOLDER_BACKGROUND.dark
      : PLACEHOLDER_BACKGROUND.light,
  });
  mainWindow = window;
  keepAliveAfterClose(app, window, closeKeepsAppAlive(currentPlatform()));
  const preview = new ElectronPreviewHost(window);

  let client: LibraryClient;
  let clientId = "";
  let close = (): void => {};
  try {
    const connected = await connectToSupervisor(import.meta.url, args.root);
    client = connected.client;
    clientId = connected.clientId;
    close = () => connected.client.close();
    // 应用正常退出：先向管理进程道别，它会停掉这条连接名下的标签页运行（最多等 5 秒）
    const quit = new QuitCoordinator(app, async () => {
      try {
        await connected.client.call("session.bye", {});
      } finally {
        close();
      }
    });
    app.on("before-quit", (event) => {
      if (quit.handleBeforeQuit()) event.preventDefault();
    });
  } catch (error) {
    diagnostic(`could not reach the supervisor: ${String(error)}`);
    client = unavailableClient(error);
  }

  const controller = new LibraryController({ client, clientId, locale, preview });
  registerBridgeHandlers(
    {
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
    },
    controller,
    buildBootstrapInfo(currentPlatform(), {
      locale,
      systemDark: nativeTheme.shouldUseDarkColors,
      reducedTransparency: nativeTheme.prefersReducedTransparency,
      highContrast: nativeTheme.shouldUseHighContrastColors,
    }),
  );
  await window.loadURL(`${APP_ORIGIN}/`);
  await controller.start();

  if (args.smoke) {
    const code = await runSmoke(controller, window, preview, diagnostic);
    app.exit(code);
  }
}

const parsed = parseDesktopArgs(process.argv.slice(2), process.env);
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
  if (claimSingleInstance(app, () => focusWindow(mainWindow))) {
    void app.whenReady().then(() => main(args));
  }
}
