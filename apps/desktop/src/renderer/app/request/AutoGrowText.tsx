import { ScrollArea } from "@runyard/ui";
import { type ChangeEvent, useLayoutEffect, useRef } from "react";
import styles from "./RequestPanel.module.css";

export function AutoGrowText({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.style.blockSize = "auto";
    element.style.blockSize = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <ScrollArea className={styles.editorScroll}>
      <textarea
        ref={field}
        className={styles.textarea}
        value={value}
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      />
    </ScrollArea>
  );
}
