import { join } from "node:path";
import type { CodeRegistries } from "../../packages/i18n/build/code-families.ts";
import { type LoadedCatalogs, loadCatalogs } from "../../packages/i18n/build/load-catalogs.ts";
import * as protocol from "../../packages/protocol/src/index.ts";

// 国际化检查共用：读文案（和包内测试是同一个读法）、取协议登记表。
export {
  fallbackLocale,
  locales,
  sourceLocale,
} from "../../packages/i18n/src/locale.ts";
export type { LoadedCatalogs };

export const I18N_DIR = "packages/i18n";

export function readCatalogs(root: string): LoadedCatalogs {
  return loadCatalogs(join(root, I18N_DIR));
}

// 登记表的唯一取法：国际化检查都从这里拿，测试可以传一份改过的
export const protocolRegistries: CodeRegistries = {
  errors: protocol.errorRegistry,
  notices: protocol.noticeRegistry,
  runStates: protocol.runStates,
};
