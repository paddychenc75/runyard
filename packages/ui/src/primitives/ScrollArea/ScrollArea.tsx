import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import { numbers } from "@runyard/tokens";
import {
  type ComponentProps,
  type PointerEvent,
  type Ref,
  type UIEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./ScrollArea.module.css";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

export interface ScrollAreaProps extends ComponentProps<"div"> {
  /** 往哪个方向滚；默认只竖向 */
  orientation?: ScrollAreaOrientation;
  /** 隐藏滑块但保留滚动和底层方向登记；默认沿用应用滚动条。 */
  scrollbarVisibility?: "auto" | "hidden";
  /** 真正滚动的那个元素（读 scrollTop、跟随到底部、scrollIntoView 都用它） */
  viewportRef?: Ref<HTMLDivElement>;
  /** 透传给滚动元素的属性：role、aria-label、tabIndex、onScroll、data-* */
  viewportProps?: Omit<ComponentProps<"div">, "children" | "ref" | "className">;
  /** 滚动元素的额外类名（版面上的内边距放这里，滚动条才贴着容器边） */
  viewportClassName?: string;
}

// 全应用唯一的滚动条（视觉规范第 5 节，#311）：叠加式胶囊滑块，平时 6px，指针移到滚动条
// 区域或拖动时 10px；滚动、指针在区域内移动时淡入，停下 800ms 后淡出。行为（滚动、拖动滑块、
// 键盘）交给 Base UI；“多久算空闲”它的 500ms 不合规范，所以自己记一个 data-active。
// 视口自己是可聚焦的滚动区域，键盘用户能用方向键滚动。
export function ScrollArea({
  orientation = "vertical",
  scrollbarVisibility = "auto",
  className,
  children,
  viewportRef,
  viewportProps,
  viewportClassName,
  onPointerMove,
  onPointerLeave,
  ...rest
}: ScrollAreaProps) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const wake = () => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), numbers["motion-duration-scrollbar-idle"]);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const { onScroll, ...viewportRest } = viewportProps ?? {};
  return (
    <BaseScrollArea.Root
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-orientation={orientation}
      data-scrollbars={scrollbarVisibility === "hidden" ? "hidden" : undefined}
      data-active={active ? "" : undefined}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        wake();
      }}
      onPointerLeave={(event: PointerEvent<HTMLDivElement>) => {
        onPointerLeave?.(event);
        wake();
      }}
    >
      <BaseScrollArea.Viewport
        {...viewportRest}
        ref={viewportRef}
        className={
          viewportClassName === undefined
            ? styles.viewport
            : `${styles.viewport} ${viewportClassName}`
        }
        onScroll={(event: UIEvent<HTMLDivElement>) => {
          onScroll?.(event);
          wake();
        }}
      >
        {/* Base UI 在内容上写了内联的 min-width: fit-content；只竖向滚动时压掉它，
            否则长行会把内容撑出视口（伪语言下的溢出检查抓到过） */}
        <BaseScrollArea.Content
          className={styles.content}
          style={orientation === "vertical" ? { minWidth: 0 } : undefined}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {orientation === "horizontal" ? null : (
        <BaseScrollArea.Scrollbar orientation="vertical" className={styles.scrollbar}>
          <BaseScrollArea.Thumb className={styles.thumb} />
        </BaseScrollArea.Scrollbar>
      )}
      {orientation === "vertical" ? null : (
        <BaseScrollArea.Scrollbar orientation="horizontal" className={styles.scrollbar}>
          <BaseScrollArea.Thumb className={styles.thumb} />
        </BaseScrollArea.Scrollbar>
      )}
    </BaseScrollArea.Root>
  );
}
