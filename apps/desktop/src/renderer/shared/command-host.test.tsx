// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandContext, CommandHost, useAvailableCommands, useCommand } from "./command-host.tsx";

function Probe({ show, run }: { show: boolean; run: () => void }) {
  useCommand("project.stop", show ? run : null);
  return <output>{useAvailableCommands().join(",")}</output>;
}

describe("CommandHost", () => {
  it("[DESKTOP-EDITOR-61] 部件显示期间命令才能用，卸载或条件不成立就撤掉", () => {
    const host = new CommandHost();
    const run = vi.fn();
    const view = render(
      <CommandContext.Provider value={host}>
        <Probe show run={run} />
      </CommandContext.Provider>,
    );
    expect(host.available()).toEqual(["project.stop"]);
    expect(host.run("project.stop")).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    view.rerender(
      <CommandContext.Provider value={host}>
        <Probe show={false} run={run} />
      </CommandContext.Provider>,
    );
    expect(host.available()).toEqual([]);
    expect(host.run("project.stop")).toBe(false);
  });

  it("后登记的盖掉先登记的，先登记的撤销时不会撤掉后者", () => {
    const host = new CommandHost();
    const first = vi.fn();
    const second = vi.fn();
    const undoFirst = host.register("app.new", first);
    host.register("app.new", second);
    undoFirst();
    host.run("app.new");
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
