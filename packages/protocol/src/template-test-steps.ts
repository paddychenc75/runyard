// 冒烟测试（runyard template test）的步骤标识，脚本类模板没有 ready（规格 TEMPLATES-FORMAT-43 至 44）。
// 错误码 TEMPLATE_TEST_FAILED 的 step 参数取自这里。
export const templateTestSteps = [
  "create",
  "install",
  "start",
  "ready",
  "reload",
  "stop",
  "leftovers",
] as const;
export type TemplateTestStep = (typeof templateTestSteps)[number];
