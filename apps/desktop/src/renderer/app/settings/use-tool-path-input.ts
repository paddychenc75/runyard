import type { ToolchainReport } from "@runyard/protocol";
import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { PickToolPathResult } from "../../../shared/settings-bridge.ts";
import { isToolPathInput } from "../../../shared/tool-path-input.ts";

export function useToolPathInput(
  bridge: DesktopBridge,
  tool: string,
  path: string | undefined,
  onApply: (report: ToolchainReport) => void,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<"absolute" | "invalid" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async (pick: boolean) => {
    if (pending.current) return;
    const value = draft ?? path ?? "";
    if (!pick && !isToolPathInput(value)) {
      setProblem("absolute");
      return;
    }
    pending.current = true;
    setBusy(true);
    const ticket = revision.current;
    let result: PickToolPathResult;
    try {
      result = pick
        ? await bridge.call("toolchain.pickPath", tool)
        : await bridge.call("toolchain.setPath", { tool, path: value });
    } catch {
      result = { status: "failed" };
    }
    pending.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (result.status === "set") {
      onApply(result.report);
      if (ticket === revision.current) {
        setDraft(null);
        setProblem(null);
      }
    } else if (result.status !== "cancelled" && ticket === revision.current)
      setProblem(result.status);
  };
  const edit = (value: string | null) => {
    revision.current++;
    setDraft(value);
    setProblem(null);
  };
  return { value: draft ?? path ?? "", problem, busy, run, edit };
}
