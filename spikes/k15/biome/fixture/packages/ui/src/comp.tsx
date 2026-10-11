declare const t: (k: string) => string;
export const c01 = <p>基础组件里的文字</p>; // BAD jsx
export const c02 = <button title="提示">{t("ok")}</button>; // BAD attr
export const c03 = <button title={t("tip")}>{t("ok")}</button>;
