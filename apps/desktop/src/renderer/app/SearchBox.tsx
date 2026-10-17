import { useT } from "@runyard/i18n/react";
import { Icon, Kbd } from "@runyard/ui";
import type { KeyboardEvent, RefObject } from "react";
import styles from "./SearchBox.module.css";

/** 页头放得下多少：宽 240、短 180、缩成放大镜（规格 DESKTOP-LIBRARY-VIEW-67、68） */
export type SearchSize = "wide" | "short" | "icon";

export interface SearchBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  size?: SearchSize;
}

// 资源库页页头里的搜索框（设计稿 Main、NoResults，方案 A）：只有控件填充，没有边。空着时右端是快捷键，
// 有字时是清除钮。Esc 清空（规格 DESKTOP-LIBRARY-VIEW-15）；⌘F 把焦点放进来由外壳处理。
// 缩成放大镜时输入框仍在（宽度为 0）：⌘F 照样能把焦点放进去，聚焦时整条展开，
// 输入框为空且失去焦点后缩回去。
export function SearchBox({ value, onValueChange, inputRef, size = "wide" }: SearchBoxProps) {
  const t = useT();
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && value !== "") {
      event.preventDefault();
      onValueChange("");
    }
  }
  return (
    <div className={styles.root} data-size={size}>
      {size === "icon" ? (
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("library.search.expand.aria")}
          tabIndex={-1}
          onClick={() => inputRef.current?.focus()}
        >
          <Icon name="search" size={16} />
        </button>
      ) : (
        <Icon name="search" size={16} className={styles.icon} />
      )}
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={value}
        aria-label={t("library.search.label")}
        placeholder={
          size === "wide" ? t("library.search.placeholder") : t("library.search.short.placeholder")
        }
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {value === "" ? (
        <Kbd className={styles.key}>{t("library.search.key.label")}</Kbd>
      ) : (
        <button
          type="button"
          className={styles.clear}
          aria-label={t("library.search.clear.aria")}
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
        >
          <Icon name="clear" size={16} />
        </button>
      )}
    </div>
  );
}
