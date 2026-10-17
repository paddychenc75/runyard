import type { Localized } from "@runyard/i18n";
import type { useT } from "@runyard/i18n/react";
import type { TemplateCategory } from "@runyard/protocol";
import type { ExcludedEntry, TemplatePageRow } from "../../../shared/templates-view.ts";
import type { ToolVerdict } from "./templates-model.ts";

// 文案键必须写成完整的字符串字面量（i18n-keys 检查），所以几组“值对应文案”的映射写在这里，不拼键。
type Translate = ReturnType<typeof useT>;

export function categoryLabel(t: Translate, category: TemplateCategory): Localized {
  switch (category) {
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
    case "mine":
      return t("desktop.category.mine.label");
  }
}

/** 无效原因：认识的规则有专门的一句，其余写规则标识（开发者看得懂的写法，不翻译） */
export function problemLabel(t: Translate, problem: TemplatePageRow["problem"]): Localized {
  switch (problem?.rule) {
    case "template-json-invalid":
      return t("desktop.templates.problemTemplateJson.label");
    case "runner-not-found":
      return t("desktop.templates.problemRunner.label");
    case "entry-missing":
      return t("desktop.templates.problemEntry.label");
    case "template-id-reserved":
      return t("desktop.templates.problemReserved.label");
    case "name-missing-en":
      return t("desktop.templates.problemName.label");
    case "format-version-unsupported":
      return t("desktop.templates.problemFormat.label");
    default:
      return t("desktop.templates.problemOther.label", { rule: problem?.rule ?? "" });
  }
}

export function verdictLabel(t: Translate, verdict: Exclude<ToolVerdict, null>): Localized {
  switch (verdict) {
    case "met":
      return t("desktop.templates.statusMet.label");
    case "tooOld":
      return t("desktop.templates.statusTooOld.label");
    case "missing":
      return t("desktop.templates.statusMissing.label");
  }
}

export function exclusionLabel(t: Translate, reason: ExcludedEntry["reason"]): Localized {
  switch (reason) {
    case "dependencies":
      return t("desktop.saveTemplate.reasonDeps.label");
    case "secret":
      return t("desktop.saveTemplate.reasonSecret.label");
    case "build":
      return t("desktop.saveTemplate.reasonBuild.label");
  }
}
