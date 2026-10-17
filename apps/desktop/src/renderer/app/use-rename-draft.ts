import type { Localized } from "@runyard/i18n";
import { useT } from "@runyard/i18n/react";
import { type KeyboardEvent, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError } from "../../shared/library-state.ts";
import { nameProblem } from "../create-view.ts";
import { useErrorText } from "./use-error-text.ts";

// 重命名与编辑备注的草稿（规格 DESKTOP-LIBRARY-VIEW-34 至 39）：资源库行里的行内编辑和工作区的小弹窗
// 是同一份内容（名称、备注、说明、校验、取消与保存），共用这一个状态。

export type RenameFocus = "name" | "note";

export interface RenameTarget {
  id: string;
  name: string;
  note: string;
  /** 正在运行：说明里要加“保存后会停止并用新名称重新启动” */
  running: boolean;
}

interface Session {
  target: RenameTarget;
  focus: RenameFocus;
  name: string;
  note: string;
  rejected: DesktopError | null;
  busy: boolean;
}

export interface RenameDraft {
  /** 正在编辑的项目；没有在编辑是 null */
  session: Session | null;
  begin: (target: RenameTarget, focus: RenameFocus) => void;
  cancel: () => void;
  setName: (name: string) => void;
  setNote: (note: string) => void;
  save: () => Promise<void>;
  /** 名称下的错误句子；没有错误是 undefined */
  nameError: Localized | undefined;
  canSave: boolean;
  /** 输入框的键盘：回车保存（输入法确认候选词的回车除外），Esc 取消 */
  onKeyDown: (event: KeyboardEvent) => void;
}

function sessionOf(target: RenameTarget, focus: RenameFocus): Session {
  return { target, focus, name: target.name, note: target.note, rejected: null, busy: false };
}

/**
 * @param taken 资源库里全部项目的名称（含正在编辑的这个：它自己的原名不算重名）
 * @param initial 一开始就在编辑的项目（工作区的小弹窗）；资源库行不给，点菜单项时再 begin
 */
export function useRenameDraft(
  bridge: DesktopBridge,
  taken: readonly string[],
  initial?: { target: RenameTarget; focus: RenameFocus },
): RenameDraft {
  const t = useT();
  const errorText = useErrorText();
  const [session, setSession] = useState<Session | null>(() =>
    initial === undefined ? null : sessionOf(initial.target, initial.focus),
  );

  const others = session === null ? taken : taken.filter((name) => name !== session.target.name);
  const problem =
    session === null || session.name === session.target.name
      ? null
      : nameProblem(session.name, others);
  const canSave = session !== null && problem === null && !session.busy;

  function patch(change: Partial<Session>) {
    setSession((current) => (current === null ? current : { ...current, ...change }));
  }

  async function save() {
    if (session === null || !canSave) return;
    patch({ busy: true });
    const result = await bridge.call("playground.edit", {
      id: session.target.id,
      name: session.name,
      note: session.note.trim(),
    });
    if (result.ok) setSession(null);
    else patch({ busy: false, rejected: result.error });
  }

  function nameError(): Localized | undefined {
    if (session === null) return undefined;
    if (problem === "taken") return t("desktop.create.nameTaken.hint");
    if (problem === "invalid") return t("desktop.create.nameInvalid.hint");
    const { rejected } = session;
    if (rejected === null) return undefined;
    // 界面放过、管理进程不认的（保留名、文件夹被占用……）：原样显示它的说法
    if (rejected.code === "NAME_EXISTS") return t("desktop.create.nameTaken.hint");
    if (rejected.code === "NAME_INVALID") return t("desktop.create.nameInvalid.hint");
    return errorText(rejected, "title");
  }

  return {
    session,
    begin: (target, focus) => setSession(sessionOf(target, focus)),
    cancel: () => setSession(null),
    setName: (name) => patch({ name, rejected: null }),
    setNote: (note) => patch({ note, rejected: null }),
    save,
    nameError: nameError(),
    canSave,
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setSession(null);
      } else if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        void save();
      }
    },
  };
}
