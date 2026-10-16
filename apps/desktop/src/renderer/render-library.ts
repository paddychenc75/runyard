import type { DesktopBridge } from "../shared/desktop-bridge.ts";
import type { LibraryView } from "./library-view.ts";

// 把 LibraryView 摆到页面上。纯 DOM，不含任何文字：文字全部来自 LibraryView。
// 每次状态变化整块重画，最早的外壳不求精细。

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderLibrary(root: HTMLElement, view: LibraryView, bridge: DesktopBridge): void {
  const list = element("section", "library");
  list.append(element("h1", "heading", view.heading));
  if (view.errorText !== null) list.append(element("p", "error", view.errorText));
  if (view.emptyHint !== null) list.append(element("p", "hint", view.emptyHint));

  const rows = element("ul", "rows");
  for (const row of view.rows) {
    const item = element("li", row.previewing ? "row previewing" : "row");
    item.dataset.playground = row.id;
    const name = element("button", "name", row.name);
    name.addEventListener("click", () => void bridge.call("preview.select", row.id));
    const state = element("span", "state", row.stateLabel);
    const action = element("button", "action", row.actionLabel);
    action.disabled = row.busy;
    action.addEventListener("click", () => {
      void bridge.call(row.action === "run" ? "run.start" : "run.stop", row.id);
    });
    item.append(name, state, action);
    rows.append(item);
  }
  list.append(rows);

  const create = element("div", "create");
  create.append(element("h2", "heading", view.createHeading));
  for (const template of view.templates) {
    const button = element("button", "template", template.label);
    button.addEventListener("click", () => void bridge.call("playground.create", template.id));
    create.append(button);
  }
  list.append(create);

  const preview = element("section", "preview");
  preview.append(element("p", "hint", view.previewPlaceholder));
  root.replaceChildren(list, preview);
  document.title = view.windowTitle;
  document.documentElement.lang = view.locale;
}
