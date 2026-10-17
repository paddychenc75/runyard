import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TemplateDetailView, TemplatePageRow } from "../../../shared/templates-view.ts";

export type TemplatesLoad =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; rows: TemplatePageRow[] };

export type DetailLoad =
  | { status: "loading" }
  | { status: "gone" }
  | { status: "ready"; detail: TemplateDetailView };

/** 模板页的数据：每次打开页面重读列表（手写的模板不用重启就在），选中谁就读谁的详情 */
export function useTemplates(bridge: DesktopBridge) {
  const [load, setLoad] = useState<TemplatesLoad>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailLoad>({ status: "loading" });
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    let live = true;
    bridge.call("template.list").then(
      (rows) => {
        if (!live) return;
        setLoad({ status: "ready", rows });
        // 第一次进来先选第一个（设计稿 Templates 里右边总有一个模板的详情）
        const first = rows[0];
        if (selectedRef.current === null && first !== undefined) setSelected(first.key);
      },
      () => live && setLoad({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [bridge]);

  const row =
    load.status === "ready" ? load.rows.find((candidate) => candidate.key === selected) : undefined;
  const rowKey = row?.key;
  const rowId = row?.id;
  const rowSource = row?.source;
  useEffect(() => {
    if (rowKey === undefined || rowId === undefined || rowSource === undefined) return;
    let live = true;
    setDetail({ status: "loading" });
    bridge.call("template.detail", { id: rowId, source: rowSource }).then(
      (found) =>
        live && setDetail(found === null ? { status: "gone" } : { status: "ready", detail: found }),
      () => live && setDetail({ status: "gone" }),
    );
    return () => {
      live = false;
    };
  }, [bridge, rowKey, rowId, rowSource]);

  return { load, selected, select: setSelected, row, detail };
}
