import type { Localized } from "@runyard/i18n";
import { type ComponentProps, type UIEvent, useLayoutEffect, useRef, useState } from "react";
import { UserText } from "../../primitives/UserText/index.ts";
import styles from "./LogView.module.css";

export type LogViewTone = "plain" | "command" | "notice" | "error";

export interface LogViewLine {
  /** 单调递增的编号，做 React 的 key；追加和整体替换都靠它认出同一行 */
  id: number;
  /** 行首的时间（已格式化）；不给就不占位 */
  time?: string;
  tone?: LogViewTone;
  /** 进程自己的输出：不翻译、不换算，原样显示 */
  text: string;
}

export interface LogViewProps extends Omit<ComponentProps<"div">, "children"> {
  lines: readonly LogViewLine[];
  /** 读屏器读的区域名 */
  label: Localized;
  /** 没有任何行时显示的说明 */
  empty?: Localized;
}

// 没量出行高之前（第一次绘制前、没有版面的环境）最多画这么多行，免得一次画出几千行
const UNMEASURED_LIMIT = 200;
// 上下各多画几行，快速滚动时不露白
const OVERSCAN = 8;
// 离底部不超过这个距离（按行数）就认为用户“在底部”，新行到来时跟着滚
const STICK_ROWS = 1;

// 日志视图：等宽、一行一条、不折行（行高固定，才能只画看得见的那一段），新行到来时
// 如果用户在底部就跟到底部，往上翻看就不打扰。虚拟滚动：总高度由行数乘行高撑出，
// 只有视口内加上下余量的行在 DOM 里。
export function LogView({ lines, label, empty, className, ...rest }: LogViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [rowHeight, setRowHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // 每次渲染后重新量一次：字号或缩放变了行高也跟着变
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    const measured = probe.current?.getBoundingClientRect().height ?? 0;
    if (measured !== rowHeight) setRowHeight(measured);
    if (node.clientHeight !== viewport) setViewport(node.clientHeight);
    if (stick.current && rowHeight > 0) {
      node.scrollTop = node.scrollHeight;
      if (node.scrollTop !== scrollTop) setScrollTop(node.scrollTop);
    }
  });

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    setScrollTop(node.scrollTop);
    const distance = node.scrollHeight - node.clientHeight - node.scrollTop;
    stick.current = distance <= Math.max(rowHeight, 1) * STICK_ROWS;
  };

  const measured = rowHeight > 0 && viewport > 0;
  let first = 0;
  let last = lines.length;
  if (measured) {
    first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    last = Math.min(lines.length, Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN);
  } else if (lines.length > UNMEASURED_LIMIT) {
    first = lines.length - UNMEASURED_LIMIT;
  }
  const visible = lines.slice(first, last);

  return (
    <div
      {...rest}
      ref={scroller}
      role="log"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: #176 可滚动的日志区要能用键盘聚焦，才能用方向键翻看
      tabIndex={0}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      onScroll={onScroll}
      data-virtual={measured ? "" : undefined}
    >
      {/* 量行高用的探针：一行的高度由样式固定，所以量一行就够 */}
      <div ref={probe} className={styles.probe} aria-hidden="true" />
      {lines.length === 0 && empty !== undefined ? <p className={styles.empty}>{empty}</p> : null}
      <div style={measured ? { paddingBlockStart: first * rowHeight } : undefined} />
      {visible.map((line) => (
        <div key={line.id} className={styles.line} data-tone={line.tone ?? "plain"}>
          {line.time === undefined ? null : <span className={styles.time}>{line.time}</span>}
          <UserText mono className={styles.text}>
            {line.text}
          </UserText>
        </div>
      ))}
      <div
        style={measured ? { paddingBlockStart: (lines.length - last) * rowHeight } : undefined}
      />
    </div>
  );
}
