import type { Localized } from "@runyard/i18n";
import { SettingsGroup, SettingsNote } from "./SettingsGroup.tsx";

// 设计稿里有、但不归这一期做的组：只画组名和一行说明，写明由哪个 issue 提供（#189、#195）。
export function PendingGroup({ title, note }: { title: Localized; note: Localized }) {
  return (
    <SettingsGroup title={title}>
      <SettingsNote>{note}</SettingsNote>
    </SettingsGroup>
  );
}
