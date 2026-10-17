import { useT } from "@runyard/i18n/react";
import { GlassSurface, Icon } from "@runyard/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./FindBar.module.css";
import type { FindOptions, FindResults } from "./terminal-session.ts";

export interface FindBarProps {
  results: FindResults;
  /** 条件变了（输入、切换选项）：按新条件从头找 */
  onQuery: (text: string, options: FindOptions) => void;
  onStep: (direction: "next" | "previous") => void;
  /** Esc 或点关闭：关掉查找栏，焦点还给终端 */
  onClose: () => void;
}

// 终端右上角的查找栏（设计稿 TerminalFind，规格 DESKTOP-TERMINAL-23）：输入框带三个开关
// （区分大小写、全词、正则），“第 N 个，共 M 个”，上一个、下一个、关闭。⌘F 打开时焦点进输入框。
export function FindBar({ results, onQuery, onStep, onClose }: FindBarProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<FindOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const query = (nextText: string, nextOptions: FindOptions) => {
    setText(nextText);
    setOptions(nextOptions);
    onQuery(nextText, nextOptions);
  };
  const toggle = (key: keyof FindOptions) => query(text, { ...options, [key]: !options[key] });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? "previous" : "next");
    } else if (event.metaKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      onStep(event.shiftKey ? "previous" : "next");
    } else if (event.metaKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      input.current?.select();
    }
  };

  const summary =
    text === ""
      ? null
      : results.count === 0
        ? t("desktop.terminalFind.none.label")
        : t("desktop.terminalFind.count.label", {
            index: Math.max(results.index, 0) + 1,
            total: results.count,
          });
  const switches = [
    {
      key: "caseSensitive",
      label: t("desktop.terminalFind.case.label"),
      aria: t("desktop.terminalFind.case.aria"),
    },
    {
      key: "wholeWord",
      label: t("desktop.terminalFind.word.label"),
      aria: t("desktop.terminalFind.word.aria"),
    },
    {
      key: "regex",
      label: t("desktop.terminalFind.regex.label"),
      aria: t("desktop.terminalFind.regex.aria"),
    },
  ] as const;

  return (
    <GlassSurface
      material="menu"
      role="search"
      aria-label={t("desktop.terminalFind.aria")}
      className={styles.root}
      onKeyDown={onKeyDown}
    >
      <span className={styles.field}>
        <Icon name="search" size={13} className={styles.searchIcon} />
        <input
          ref={input}
          className={styles.input}
          value={text}
          aria-label={t("desktop.terminalFind.field.aria")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => query(event.target.value, options)}
        />
        {switches.map(({ key, label, aria }) => (
          <button
            key={key}
            type="button"
            className={styles.toggle}
            aria-label={aria}
            aria-pressed={options[key]}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        ))}
      </span>
      <span className={styles.count} aria-live="polite">
        {summary}
      </span>
      <button
        type="button"
        className={styles.step}
        aria-label={t("desktop.terminalFind.previous.aria")}
        onClick={() => onStep("previous")}
      >
        <Icon name="chevron-down" size={14} className={styles.flipped} />
      </button>
      <button
        type="button"
        className={styles.step}
        aria-label={t("desktop.terminalFind.next.aria")}
        onClick={() => onStep("next")}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      <button
        type="button"
        className={styles.step}
        aria-label={t("desktop.terminalFind.close.aria")}
        onClick={onClose}
      >
        <Icon name="close" size={10} />
      </button>
    </GlassSurface>
  );
}
