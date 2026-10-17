import { useT } from "@runyard/i18n/react";
import { type FormEvent, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./ScriptInput.module.css";

export interface ScriptInputProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 脚本输出区底部的输入行（设计稿 Script）：运行中回车把这一行加换行交给程序的标准输入，
// 然后清空；没在运行时不可输入，右边写“仅程序运行中可用”（规格 DESKTOP-WORKSPACE-37、38）。
export function ScriptInput({ bridge, tab }: ScriptInputProps) {
  const t = useT();
  const [line, setLine] = useState("");
  const live = tab.active && tab.state === "running";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!live) return;
    void bridge.call("run.stdin", { id: tab.id, line });
    setLine("");
  };
  return (
    <form className={styles.root} onSubmit={submit} data-script-input={tab.id} data-live={live}>
      <input
        className={styles.input}
        value={line}
        disabled={!live}
        aria-label={t("desktop.script.input.aria")}
        placeholder={t("desktop.script.input.placeholder")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setLine(event.target.value)}
      />
      {live ? null : <span className={styles.hint}>{t("desktop.script.inputDisabled.hint")}</span>}
    </form>
  );
}
