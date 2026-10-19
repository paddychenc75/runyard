import type { Localized } from "@runyard/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { NoticeList } from "./NoticeList.tsx";

const text = (s: string) => s as Localized;
it("[DESKTOP-NOTIFICATIONS-05] 键盘打开分组列表，Escape回到入口且清空回调一次", async () => {
  const clear = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <NoticeList
        open={open}
        onOpenChange={setOpen}
        trigger={<button type="button">通知</button>}
        title={text("通知列表")}
        clearLabel={text("全部清除")}
        requiredLabel={text("需要处理")}
        recentLabel={text("最近")}
        emptyLabel={text("暂无")}
        required={<p>更新</p>}
        recent={<p>智能体</p>}
        hasRecent
        onClear={clear}
      />
    );
  }
  render(<Example />);
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByText("更新")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "全部清除" }));
  expect(clear).toHaveBeenCalledOnce();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "通知" })),
  );
});
