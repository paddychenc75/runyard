// 约定：行尾 "// BAD <规则>" 表示该行必须被那条规则拦住；没有标记的行必须没有任何诊断。
// 规则名：jsx = style/noJsxLiterals，grit = GritQL 插件（原生元素属性里的字面量、JSX 子节点里的字符串表达式）
declare const t: (k: string, p?: object) => string;
declare const name: string;
declare const cond: boolean;
declare const Button: any;
export const c01 = <p>还没有项目</p>; // BAD jsx
export const c02 = <p>No projects yet</p>; // BAD jsx
export const c03 = <p>© 2026</p>; // BAD jsx
export const c04 = <p>{"文字"}</p>; // BAD grit
export const c05 = <p>{`模板`}</p>; // BAD grit
export const c06 = <p>{cond ? "是" : "否"}</p>; // BAD grit
export const c07 = <p>·</p>;
export const c08 = <p>›</p>;
export const c09 = <p>:</p>;
export const c10 = <p>{t("empty")}</p>;
export const c11 = <p>{t("empty", { n: 1 })}</p>;
export const c12 = <p>{name}</p>;
export const c13 = <p>{name}: {name}</p>;
export const c14 = <p>  </p>;
export const c15 = <div className="card big" data-testid="card" key="k" id="main" role="img" />;
export const c16 = <Button label="保存" title="提示" aria-label="组件上的" />;
export const c17 = <input aria-label="关闭" />; // BAD grit
export const c18 = <input placeholder="搜索" />; // BAD grit
export const c19 = <img alt="图标" src="a.png" />; // BAD grit
export const c20 = <div title="提示" />; // BAD grit
export const c21 = <input aria-label={"关闭"} />; // BAD grit
export const c22 = <input aria-label={`关闭`} />; // BAD grit
export const c23 = <input aria-label={t("close")} />;
export const c24 = <input aria-label={name} title={name} />;
export const c25 = <input aria-label="关闭" placeholder="搜索" title="提示" />; // BAD grit
export const c26 = <div aria-hidden="true" data-i18n-skip="reason" />;
export const c27 = <div title={`a ${name}`} />; // BAD grit
export const c28 = <section><h1>{t("title")}</h1><p>正文</p></section>; // BAD jsx
export const c29 = <p>{cond ? t("a") : "否"}</p>; // BAD grit
export const c30 = <p>{name || "未命名"}</p>; // BAD grit
export const c31 = <p>{cond ? t("a") : t("b")}</p>;
export const c32 = <p>{`x ${name}`}</p>; // BAD grit
export const c33 = <ul>{[1, 2].map((i) => <li key={i}>{t("item", { i })}</li>)}</ul>;
