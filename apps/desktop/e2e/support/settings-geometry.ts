import type { Page } from "@playwright/test";

/** 测真实边框，不能用整页scrollWidth代替内部列和控件的几何关系。 */
export async function settingsGeometry(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("[data-settings-header]") as HTMLElement;
    const heading = header.firstElementChild as HTMLElement;
    const title = header.querySelector("h1") as HTMLElement;
    const pill = header.querySelector("button") as HTMLElement;
    const column = document.querySelector("[data-settings-column]") as HTMLElement;
    const viewport = document.getElementById("settings-viewport") as HTMLElement;
    const groups = [...column.querySelectorAll("[data-settings-section]")].map((section) => {
      const h2 = section.querySelector("h2") as HTMLElement;
      const groupHeader = h2.parentElement as HTMLElement;
      const card = groupHeader.nextElementSibling as HTMLElement;
      return {
        titleLeft: h2.getBoundingClientRect().left,
        cardLeft: card.getBoundingClientRect().left,
        cardRight: card.getBoundingClientRect().right,
        titleGap: card.getBoundingClientRect().top - groupHeader.getBoundingClientRect().bottom,
      };
    });
    const rows = [...column.querySelectorAll("[data-settings-row]")].map((row) => {
      const text = row.firstElementChild as HTMLElement;
      const control = row.lastElementChild as HTMLElement;
      const rect = row.getBoundingClientRect();
      const a = text.getBoundingClientRect();
      const b = control.getBoundingClientRect();
      const clippedControls = [...control.querySelectorAll<HTMLElement>("[data-truncate]")]
        .filter((node) => node.scrollWidth > node.clientWidth)
        .map((node) => node.textContent);
      return {
        height: rect.height,
        textWidth: a.width,
        clippedControls,
        overflow: row.scrollWidth - row.clientWidth,
        stacked: b.top >= a.bottom,
        verticalGap: b.top - a.bottom,
        gap: text === control ? null : b.left - a.right,
        rightInset: rect.right - b.right,
      };
    });
    return {
      titleLeft: title.getBoundingClientRect().left,
      pillLeft: pill.getBoundingClientRect().left,
      headingLeft: heading.getBoundingClientRect().left,
      headingWidth: heading.getBoundingClientRect().width,
      columnLeft: column.getBoundingClientRect().left,
      columnWidth: column.getBoundingClientRect().width,
      bodyOverflow: viewport.scrollWidth - viewport.clientWidth,
      groups,
      rows,
    };
  });
}
