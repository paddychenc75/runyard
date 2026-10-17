import { useT } from "@runyard/i18n/react";
import { GlassSurface, Icon, Kbd, ScrollArea } from "@runyard/ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../shared/overlay-context.tsx";
import { highlightParts } from "./fuzzy.ts";
import styles from "./Palette.module.css";

// 命令面板和快速打开的同一个浮层（规格“命令面板”：同一个浮层，开头的 > 在两者之间切换）。
// 这里只管画和键盘：行从哪来、选中后做什么由 PaletteHost 决定。
// 画在 body 下的浮层层里，并在显示期间让原生预览让位（useOverlay，技术设计 §6.1），所以不会被预览盖住。

export type PaletteEntry =
  | { type: "heading"; key: string; label: ReactNode }
  | {
      type: "option";
      key: string;
      /** 标题，已经带了命中字符的高亮 */
      label: ReactNode;
      /** 标题后面较淡的一段（快速打开的所在文件夹，或另一种语言的命令名） */
      secondary?: ReactNode;
      /** 行首的图标（快速打开的文件图标） */
      glyph?: ReactNode;
      shortcut?: string;
    };

export interface PaletteProps {
  mode: "commands" | "files";
  /** 输入框里的字；命令模式下开头的 > 不在里面，由界面单独画 */
  query: string;
  onQueryChange: (value: string) => void;
  /** 命令模式下在空输入框里按退格：删掉了开头的 >，换成快速打开 */
  onLeavePrefix: () => void;
  entries: readonly PaletteEntry[];
  onChoose: (key: string) => void;
  onClose: () => void;
  /** 一个选项都没有时显示的说明 */
  emptyLabel: string;
}

export function Palette({
  mode,
  query,
  onQueryChange,
  onLeavePrefix,
  entries,
  onChoose,
  onClose,
  emptyLabel,
}: PaletteProps) {
  const t = useT();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const options = entries.filter((entry) => entry.type === "option");
  // 查询或模式变了，选中项回到第一项：选中的下标记着它属于哪一次查询，对不上就当 0
  const resetKey = `${mode}:${query}`;
  const [selection, setSelection] = useState({ key: resetKey, index: 0 });
  const active = selection.key === resetKey ? selection.index : 0;
  const setActive = (index: number) => setSelection({ key: resetKey, index });
  const clamped = Math.min(active, Math.max(0, options.length - 1));
  const activeKey = options[clamped]?.key;
  useOverlay(true);
  useLayoutEffect(() => {
    input.current?.focus();
  }, []);
  // 方向键移动时让选中行始终看得见
  useEffect(() => {
    if (activeKey === undefined) return;
    document.getElementById(`${listId}-${activeKey}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey, listId]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 输入法正在组词时，回车和方向键是在选候选词，不归面板管
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((clamped + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeKey !== undefined) onChoose(activeKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Backspace" && mode === "commands" && query === "") {
      event.preventDefault();
      onLeavePrefix();
    }
  }

  const title =
    mode === "commands" ? t("desktop.palette.commands.aria") : t("desktop.palette.files.aria");
  return createPortal(
    <>
      {/* 点面板外面关闭：整窗口的透明按钮，不进读屏器也不进 Tab 顺序 */}
      <button
        type="button"
        className={styles.backdrop}
        tabIndex={-1}
        aria-hidden="true"
        data-palette-backdrop=""
        onMouseDown={onClose}
      />
      <GlassSurface
        material="menu"
        className={styles.panel}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        data-palette={mode}
      >
        <div className={styles.input}>
          <Icon name="search" size={16} />
          <div className={styles.field}>
            {mode === "commands" ? <span className={styles.prefix} aria-hidden="true" /> : null}
            <input
              ref={input}
              className={styles.text}
              value={query}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={activeKey === undefined ? undefined : `${listId}-${activeKey}`}
              aria-label={title}
              placeholder={
                mode === "commands"
                  ? t("desktop.palette.commandsPlaceholder.label")
                  : t("desktop.palette.filesPlaceholder.label")
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <Kbd className={styles.kbd}>{t("desktop.palette.escape.label")}</Kbd>
        </div>
        <ScrollArea className={styles.list} viewportClassName={styles.listViewport}>
          <div id={listId} role="listbox" aria-label={t("desktop.palette.results.aria")}>
            {options.length === 0 ? <div className={styles.empty}>{emptyLabel}</div> : null}
            {entries.map((entry) =>
              entry.type === "heading" ? (
                <div key={entry.key} className={styles.heading} role="presentation">
                  {entry.label}
                </div>
              ) : (
                <div
                  key={entry.key}
                  id={`${listId}-${entry.key}`}
                  role="option"
                  aria-selected={entry.key === activeKey}
                  className={styles.row}
                  onMouseMove={() => setActive(options.findIndex((o) => o.key === entry.key))}
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    // 点选项不能把焦点从输入框抢走，按下就执行
                    event.preventDefault();
                    onChoose(entry.key);
                  }}
                >
                  {entry.glyph}
                  <span className={styles.label}>
                    <span>{entry.label}</span>
                    {entry.secondary === undefined ? null : (
                      <span className={styles.secondary}>{entry.secondary}</span>
                    )}
                  </span>
                  {entry.shortcut === undefined ? null : (
                    <span className={styles.shortcut}>{entry.shortcut}</span>
                  )}
                </div>
              ),
            )}
          </div>
        </ScrollArea>
        <div className={styles.footer}>
          <Kbd className={styles.kbd}>{t("desktop.palette.moveKeys.label")}</Kbd>
          <span>{t("desktop.palette.move.label")}</span>
          <span className={styles.gap} />
          <Kbd className={styles.kbd}>{t("desktop.palette.enterKey.label")}</Kbd>
          <span>
            {mode === "commands"
              ? t("desktop.palette.execute.label")
              : t("desktop.palette.open.label")}
          </span>
          <span className={styles.spacer} />
          <span>
            {mode === "commands"
              ? t("desktop.palette.commandsHint.label")
              : t("desktop.palette.filesHint.label")}
          </span>
        </div>
      </GlassSurface>
    </>,
    document.body,
  );
}

/** 把文字按命中位置拆成普通和高亮两种片段 */
export function Highlighted({ text, hits }: { text: string; hits: readonly number[] }) {
  return (
    <>
      {highlightParts(text, hits).map((part) =>
        part.hit ? (
          <span key={part.start} className={styles.hit}>
            {part.text}
          </span>
        ) : (
          <span key={part.start}>{part.text}</span>
        ),
      )}
    </>
  );
}
