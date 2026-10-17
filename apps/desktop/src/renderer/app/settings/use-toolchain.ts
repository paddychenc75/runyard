import type { ToolCheck, ToolchainReport } from "@runyard/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";

export interface ToolchainView {
  /** 第一次读到之前是 null；只含已有模板用到的工具 */
  tools: ToolCheck[] | null;
  /** 正在重新检测 */
  checking: boolean;
  /** 重新检测：清缓存、重新读登录环境（规格 DESKTOP-SETTINGS-17） */
  recheck: () => void;
  /** 管理进程接受了新路径之后给出的全部结果 */
  apply: (report: ToolchainReport) => void;
}

// 运行环境表的数据（规格 DESKTOP-SETTINGS-15、16）：打开设置页先读缓存立即画出来，同时在后台实时检测，
// 检测完表格更新；之后管理进程说检测结果变了（toolchain.changed）就再读缓存。
// 重新检测和指定路径返回的是全部已知工具，这里只留表里原本有的那几个。
export function useToolchain(bridge: DesktopBridge): ToolchainView {
  const [tools, setTools] = useState<ToolCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const listed = useRef<readonly string[] | null>(null);
  // 先发的请求晚回来时不盖掉后发的结果
  const latest = useRef(0);

  const show = useCallback((report: ToolchainReport | undefined, ticket: number) => {
    // 主进程没接上（读不到）时保持现状
    if (report === undefined || ticket !== latest.current) return;
    const names = listed.current;
    if (names === null && report.tools.length > 0) {
      listed.current = report.tools.map((tool) => tool.tool);
    }
    setTools(
      names === null ? report.tools : report.tools.filter((tool) => names.includes(tool.tool)),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const read = (cachedOnly: boolean) => {
      const ticket = ++latest.current;
      return bridge.call("toolchain.check", { cachedOnly }).then(
        (report) => alive && show(report, ticket),
        () => {},
      );
    };
    void read(true).then(() => alive && read(false));
    const stop = bridge.on("toolchain.changed", () => void read(true));
    return () => {
      alive = false;
      stop();
    };
  }, [bridge, show]);

  const recheck = useCallback(() => {
    const ticket = ++latest.current;
    setChecking(true);
    void bridge.call("toolchain.recheck").then(
      (report) => {
        show(report, ticket);
        setChecking(false);
      },
      () => setChecking(false),
    );
  }, [bridge, show]);

  const apply = useCallback((report: ToolchainReport) => show(report, ++latest.current), [show]);
  return { tools, checking, recheck, apply };
}
