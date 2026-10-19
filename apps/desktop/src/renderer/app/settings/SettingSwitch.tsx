import type { Localized } from "@runyard/i18n";
import { Switch } from "@runyard/ui";

// 设置页沿用共享开关的 42 × 26 设计变量。
export function SettingSwitch(props: {
  label: Localized;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <Switch {...props} />;
}
