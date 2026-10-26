import { useT } from "@runyard/i18n/react";
import { Button, Dialog, UserText } from "@runyard/ui";
import styles from "./SkillGuideDialog.module.css";

export function SkillGuideDialog({
  content,
  onClose,
}: {
  content: string | null;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog
      open={content !== null}
      wide
      title={t("settings.skills.guide.action")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={onClose}
      actions={<Button type="submit">{t("settings.skills.closeGuide.action")}</Button>}
    >
      <pre className={styles.content}>
        <UserText>{content}</UserText>
      </pre>
    </Dialog>
  );
}
