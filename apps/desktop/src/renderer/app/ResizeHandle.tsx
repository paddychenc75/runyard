import { useT } from "@runyard/i18n/react";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { clamp, type Range } from "../../shared/pane-sizes.ts";
import styles from "./ResizeHandle.module.css";

export interface ResizeHandleProps {
  /** vertical：竖条，左右拖，改宽度；horizontal：横条，上下拖，改高度 */
  orientation: "vertical" | "horizontal";
  label: string;
  /** 面板现在的尺寸（像素）和能拖到的范围 */
  value: number;
  range: Range;
  /** 往右（竖条）或往下（横条）拖时，面板是变大还是变小：面板在分隔条左边/上边是 grow，右边/下边是 shrink */
  growsTowardEnd: boolean;
  onResize: (size: number) => void;
  /** 双击：恢复默认尺寸 */
  onReset: () => void;
}

const KEY_STEP_PX = 16;

// 分隔条（规格 DESKTOP-WORKSPACE-55 至 59）：指针拖动、方向键微调、双击恢复默认。
// 指针被捕获，拖出分隔条也继续跟；尺寸每一帧都经 onResize 交出去，范围在这里夹紧。
export function ResizeHandle({
  orientation,
  label,
  value,
  range,
  growsTowardEnd,
  onResize,
  onReset,
}: ResizeHandleProps) {
  const t = useT();
  const start = useRef<{ pointer: number; size: number } | null>(null);
  const horizontal = orientation === "horizontal";
  const axis = (event: { clientX: number; clientY: number }) =>
    horizontal ? event.clientY : event.clientX;
  const sign = growsTowardEnd ? 1 : -1;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start.current = { pointer: axis(event), size: value };
    event.currentTarget.dataset.dragging = "";
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    if (from === null) return;
    onResize(clamp(from.size + sign * (axis(event) - from.pointer), range));
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    start.current = null;
    delete event.currentTarget.dataset.dragging;
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = horizontal ? "ArrowDown" : "ArrowRight";
    const back = horizontal ? "ArrowUp" : "ArrowLeft";
    if (event.key === "Enter") {
      event.preventDefault();
      onReset();
      return;
    }
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    const step = (event.key === forward ? 1 : -1) * sign * KEY_STEP_PX;
    onResize(clamp(value + step, range));
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: 可聚焦的分隔条按 WAI-ARIA 的 window splitter 写成 separator 角色，<hr> 不能聚焦（#309）
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={value}
      aria-description={t("workspace.resize.hint")}
      className={styles.root}
      data-orientation={orientation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
