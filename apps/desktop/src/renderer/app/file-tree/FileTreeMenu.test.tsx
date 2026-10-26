// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContentVisibility } from "../../shared/content-visibility.ts";
import { FileTreeMenu } from "./FileTreeMenu.tsx";

afterEach(cleanup);

it("[DESKTOP-SETTINGS-45] 隐藏工作区时文件树右键Portal菜单关闭且不能操作文件", async () => {
  const close = vi.fn();
  const select = vi.fn();
  const target = { x: 20, y: 20, path: null };
  const content = (visible: boolean) => (
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <ContentVisibility.Provider value={visible}>
        <FileTreeMenu target={target} onClose={close} onSelect={select} />
      </ContentVisibility.Provider>
    </I18nProvider>
  );
  const view = render(content(true));
  await screen.findByRole("menu");
  view.rerender(content(false));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(close).toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
