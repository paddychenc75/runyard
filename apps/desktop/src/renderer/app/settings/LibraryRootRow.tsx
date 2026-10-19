import { useT } from "@runyard/i18n/react";
import type { SettingsPatch } from "@runyard/protocol";
import { Button, ButtonGroup, ConfirmDialog, UserText } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryRootChoice } from "../../../shared/settings-bridge.ts";
import { SettingsRow } from "./SettingsGroup.tsx";

export interface LibraryRootRowProps {
  bridge: DesktopBridge;
  /** 主目录缩成 ~ 的写法 */
  display: string;
  update: (patch: SettingsPatch) => void;
}

type Stage = "protected" | "confirm";

// 资源库位置（规格 DESKTOP-SETTINGS-05、06）：选好文件夹后，在“桌面”“文档”“下载”里先警告隐私权限弹窗，
// 再确认“旧位置的项目留在原处”，用户确认后才写进设置；取消什么都不改。
export function LibraryRootRow({ bridge, display, update }: LibraryRootRowProps) {
  const t = useT();
  const [choice, setChoice] = useState<LibraryRootChoice | null>(null);
  const [stage, setStage] = useState<Stage>("confirm");
  const cancel = () => setChoice(null);
  const change = async () => {
    const picked = await bridge.call("settings.pickLibraryRoot");
    if (picked === null) return;
    setChoice(picked);
    setStage(picked.protectedFolder ? "protected" : "confirm");
  };
  return (
    <>
      <SettingsRow
        title={t("settings.libraryRoot.title")}
        hint={<UserText>{display}</UserText>}
        monoHint
      >
        <ButtonGroup>
          <Button onClick={() => void change()}>{t("settings.libraryRoot.change.action")}</Button>
          <Button onClick={() => void bridge.call("settings.revealLibraryRoot")}>
            {t("settings.libraryRoot.reveal.action")}
          </Button>
        </ButtonGroup>
      </SettingsRow>
      {choice === null ? null : (
        <>
          <ConfirmDialog
            open={stage === "protected"}
            icon="warning"
            title={t("settings.libraryRoot.protected.title")}
            description={t("settings.libraryRoot.protected.body")}
            cancelLabel={t("settings.dialog.cancel.action")}
            confirmLabel={t("settings.libraryRoot.continue.action")}
            onConfirm={() => setStage("confirm")}
            onCancel={cancel}
          />
          <ConfirmDialog
            open={stage === "confirm"}
            icon="warning"
            title={t("settings.libraryRoot.confirm.title", { path: choice.display })}
            description={t("settings.libraryRoot.confirm.body")}
            cancelLabel={t("settings.dialog.cancel.action")}
            confirmLabel={t("settings.libraryRoot.move.action")}
            onConfirm={() => {
              update({ libraryRoot: choice.path });
              cancel();
            }}
            onCancel={cancel}
          />
        </>
      )}
    </>
  );
}
