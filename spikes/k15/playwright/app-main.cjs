// 最小的 Electron 应用：一个窗口，里面挂一个 WebContentsView（预览视图的最小形态）。
// 视图和宿主页面各装一小段 data: 页面，便于在测试里区分。
const { app, BrowserWindow, WebContentsView } = require("electron");

const page = (title, body) =>
  "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="margin:0;font:20px system-ui">${body}</body>`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 640, height: 420, show: true, webPreferences: { sandbox: true } });
  await win.loadURL(page("host", `<h1 id="host">宿主页面 host</h1>`));
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 100, width: 640, height: 320 });
  await view.webContents.loadURL(page("preview", `<h1 id="v">预览视图 preview</h1><p>端口 5173</p>`));
  globalThis.__win = win; // 测试里用 electronApp.evaluate 取到它们
  globalThis.__view = view;
  globalThis.__ready = true;
});
app.on("window-all-closed", () => app.quit());
