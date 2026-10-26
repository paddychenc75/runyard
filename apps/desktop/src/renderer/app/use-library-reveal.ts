import { useEffect, useRef } from "react";

/** 缺失项目被请求打开时，在筛选重置并渲染完成后定位说明与主操作。 */
export function useLibraryReveal(
  reveal: { id: string; sequence: number } | undefined,
  rows: readonly { id: string }[],
  select: (id: string) => void,
): void {
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal || handled.current === reveal.sequence || !rows.some((row) => row.id === reveal.id))
      return;
    const row = [...document.querySelectorAll<HTMLElement>("tr[data-row-id]")].find(
      (node) => node.dataset.rowId === reveal.id,
    );
    if (!row) return;
    handled.current = reveal.sequence;
    select(reveal.id);
    row.scrollIntoView?.({ block: "nearest" });
    // 行内没有主操作了：焦点落在行下面说明里的主操作“重新定位…”上
    const note = document.querySelector<HTMLElement>(`[data-missing-note="${reveal.id}"]`);
    (
      note?.querySelector<HTMLButtonElement>("button") ??
      row.querySelector<HTMLButtonElement>('[data-column="actions"] button')
    )?.focus({ preventScroll: true });
  }, [reveal, rows, select]);
}
