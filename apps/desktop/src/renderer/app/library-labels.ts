import type { useT } from "@runyard/i18n/react";
import type { NavFilter, SortKey, StatusFilter, TypeFilter } from "../library-query.ts";

type Translate = ReturnType<typeof useT>;

// 键写成完整的字面量（i18n-unused 靠它找用到的键），所以每个值一个分支
export function navLabel(nav: NavFilter, t: Translate) {
  switch (nav) {
    case "all":
      return t("library.filter.all.label");
    case "kept":
      return t("library.filter.kept.label");
    case "autoClean":
      return t("library.filter.autoClean.label");
    case "agent":
      return t("library.filter.agent.label");
  }
}

export function typeLabel(type: TypeFilter, t: Translate) {
  switch (type) {
    case "all":
      return t("library.filter.all.label");
    case "page":
      return t("desktop.category.page.label");
    case "frontend":
      return t("desktop.category.frontend.label");
    case "fullstack":
      return t("desktop.category.fullstack.label");
    case "script":
      return t("desktop.category.script.label");
    case "service":
      return t("desktop.category.service.label");
  }
}

export function statusLabel(status: StatusFilter, t: Translate) {
  switch (status) {
    case "all":
      return t("library.filter.all.label");
    case "running":
      return t("library.status.running.label");
    case "stopped":
      return t("library.status.stopped.label");
    case "problem":
      return t("library.status.problem.label");
  }
}

export function sortLabel(sort: SortKey, t: Translate) {
  switch (sort) {
    case "recent":
      return t("library.sort.recent.label");
    case "name":
      return t("library.sort.name.label");
    case "created":
      return t("library.sort.created.label");
    case "size":
      return t("library.sort.size.label");
  }
}
