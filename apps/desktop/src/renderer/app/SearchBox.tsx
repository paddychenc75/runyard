import { useT } from "@runyard/i18n/react";
import { GlassSurface, Icon, Kbd } from "@runyard/ui";
import type { KeyboardEvent, RefObject } from "react";
import styles from "./SearchBox.module.css";

export interface SearchBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

// 顶栏右侧的搜索框（设计稿 Main、NoResults）：空着时右端是快捷键，有字时是清除钮。
// Esc 清空（规格 DESKTOP-LIBRARY-VIEW-15）；⌘F 把焦点放进来由外壳处理。
export function SearchBox({ value, onValueChange, inputRef }: SearchBoxProps) {
  const t = useT();
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && value !== "") {
      event.preventDefault();
      onValueChange("");
    }
  }
  return (
    <GlassSurface material="toolbar" className={styles.root}>
      <Icon name="search" size={16} className={styles.icon} />
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={value}
        aria-label={t("library.search.label")}
        placeholder={t("library.search.placeholder")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {value === "" ? (
        <Kbd>{t("library.search.key.label")}</Kbd>
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
    </GlassSurface>
  );
}
