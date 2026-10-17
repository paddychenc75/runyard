// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceFiles, WorkspaceFilesContext } from "./workspace-files.tsx";

afterEach(cleanup);

function Probe() {
  const files = useWorkspaceFiles();
  return (
    <button type="button" onClick={() => files.openFile("src/App.tsx")}>
      {files.activePath ?? "none"}
    </button>
  );
}

describe("文件树与编辑器的接缝", () => {
  it("文件树经 openFile 打开文件，并读到当前选中的文件", async () => {
    const openFile = vi.fn();
    render(
      <WorkspaceFilesContext.Provider value={{ activePath: "main.ts", openPaths: [], openFile }}>
        <Probe />
      </WorkspaceFilesContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "main.ts" }));
    expect(openFile).toHaveBeenCalledWith("src/App.tsx");
  });

  it("没有提供者时报错，不静默", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("WorkspaceFilesContext");
    quiet.mockRestore();
  });
});
