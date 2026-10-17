import type { Localized } from "@runyard/i18n";
import { Switch } from "@runyard/ui";
import styles from "./SettingSwitch.module.css";

// 设置页的开关比对话框里的小一圈（设计稿 Settings：34 × 20、圆钮 16），所以在通用开关上收小尺寸。
export function SettingSwitch(props: {
  label: Localized;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <Switch {...props} className={styles.compact} />;
}
