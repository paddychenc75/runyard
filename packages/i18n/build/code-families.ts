// 代码派生的键族：键由 protocol 的登记表决定，不由人写。全仓库只有这一份清单：
// 生成类型（generate-messages-types.ts）、i18n-codes、i18n-unused 都从这里读。
// 新增一个族必须同时给出“登记表 → 键和参数”的推导（codeEntries），不存在“只加个前缀就豁免”的写法。
// 注意：src/messages.ts 的 ErrorMessageField 是同一份字段表的类型版，build.test.ts 核对两边一致。

export const errorMessageFields = ["title", "body", "hint", "hintCli"] as const;

export type CodeFamily = "errors" | "notice" | "runState";
export const codeKeyPrefixes = ["errors.", "notice.", "runState."] as const;

export interface ParamInfo {
  optional: boolean;
  /** 参数是枚举时的全部取值；否则没有 */
  values?: readonly string[];
}

export interface CodeEntry {
  /** 文案键，如 errors.NAME_EXISTS.title */
  key: string;
  family: CodeFamily;
  /** 登记的代码或状态值，如 NAME_EXISTS */
  code: string;
  params: Readonly<Record<string, ParamInfo>>;
}

export interface CodeRegistries {
  errors: Readonly<Record<string, { params: unknown }>>;
  notices: Readonly<Record<string, { params: unknown }>>;
  runStates: readonly string[];
}

interface ZodFieldLike {
  isOptional?: () => boolean;
  unwrap?: () => ZodFieldLike;
  options?: unknown;
}

// 从 zod 对象里读出参数名、是否可选、枚举取值。只用 zod 公开的 shape / isOptional / options
export function paramsOf(schema: unknown): Record<string, ParamInfo> {
  const shape = (schema as { shape?: Record<string, ZodFieldLike> }).shape ?? {};
  const result: Record<string, ParamInfo> = {};
  for (const [name, field] of Object.entries(shape)) {
    const optional = field.isOptional?.() ?? false;
    const inner = optional && typeof field.unwrap === "function" ? field.unwrap() : field;
    const options = inner.options;
    result[name] = {
      optional,
      ...(Array.isArray(options) ? { values: options.map(String) } : {}),
    };
  }
  return result;
}

export function codeEntries(registries: CodeRegistries): CodeEntry[] {
  const entries: CodeEntry[] = [];
  for (const [code, definition] of Object.entries(registries.errors)) {
    const params = paramsOf(definition.params);
    for (const field of errorMessageFields) {
      entries.push({ key: `errors.${code}.${field}`, family: "errors", code, params });
    }
  }
  for (const [code, definition] of Object.entries(registries.notices)) {
    entries.push({
      key: `notice.${code}`,
      family: "notice",
      code,
      params: paramsOf(definition.params),
    });
  }
  for (const state of registries.runStates) {
    entries.push({ key: `runState.${state}`, family: "runState", code: state, params: {} });
  }
  return entries;
}

export function codeKeyOf(key: string): boolean {
  return codeKeyPrefixes.some((prefix) => key.startsWith(prefix));
}
