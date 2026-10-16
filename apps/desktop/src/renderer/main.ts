import { LIST_WIDTH_PX } from "../shared/layout.ts";
import { buildLibraryView } from "./library-view.ts";
import { renderLibrary } from "./render-library.ts";

// 界面入口。只用预加载脚本交出来的 window.runyard，没有别的通向主进程的路。

const root = document.getElementById("app");
if (root === null) throw new Error("missing #app");
document.documentElement.style.setProperty("--list-width", `${LIST_WIDTH_PX}px`);

const bridge = window.runyard;
const show = (state: Parameters<typeof buildLibraryView>[0]) =>
  renderLibrary(root, buildLibraryView(state), bridge);

bridge.onState(show);
void bridge.getState().then(show);
