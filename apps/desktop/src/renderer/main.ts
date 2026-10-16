import { LIST_WIDTH_PX } from "../shared/layout.ts";
import { getDesktopBridge } from "./bridge/desktop-bridge.ts";
import { buildLibraryView } from "./library-view.ts";
import { renderLibrary } from "./render-library.ts";

// 界面入口。只经 bridge/ 取预加载脚本交出来的接口，没有别的通向主进程的路。

const root = document.getElementById("app");
if (root === null) throw new Error("missing #app");
document.documentElement.style.setProperty("--list-width", `${LIST_WIDTH_PX}px`);

const bridge = getDesktopBridge();
const show = (state: Parameters<typeof buildLibraryView>[0]) =>
  renderLibrary(root, buildLibraryView(state), bridge);

bridge.on("library.changed", show);
void bridge.call("library.get").then(show);
