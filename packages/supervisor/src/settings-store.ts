import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import {
  SETTINGS_FILE_VERSION,
  type Settings,
  type SettingsPatch,
  serializeVersioned,
  settingsFileFormat,
  settingsPatchSchema,
} from "@runyard/protocol";
import { createAsyncMutex } from "./async-mutex.ts";
import { methodFailure } from "./method-failure.ts";
import {
  newerVersionFailure,
  readStateFile,
  type StateFileRead,
  writeStateFile,
} from "./state-file.ts";

// ~/.runyard/settings.json（storage.md 2.3）。读到的字段盖在默认值上；没写过的字段不落盘，
// 以后改默认值时没动过设置的用户会跟着变。

export function settingsFilePath(platform: Pick<Platform, "paths">): AbsPath {
  return absPath(join(platform.paths.stateDir, "settings.json"));
}

export function defaultSettings(platform: Pick<Platform, "paths">): Settings {
  return {
    libraryRoot: platform.paths.defaultLibrary,
    packageManager: "auto",
    scriptAutoRun: true,
    cliIdleStopMinutes: 30,
    toolPaths: {},
    ports: { min: 7100, max: 7999 },
    urlNewSkipConfirmForBuiltin: false,
    updateCheck: true,
  };
}

export interface SettingsStore {
  get(): Promise<Settings>;
  /** 只传要改的字段，返回改后的全部设置；更新版本写的文件拒绝写 */
  set(patch: SettingsPatch): Promise<Settings>;
}

export interface SettingsStoreDeps {
  readonly platform: Pick<Platform, "paths" | "fs">;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

function withoutUndefined(patch: SettingsPatch): SettingsPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as SettingsPatch;
}

export function createSettingsStore(deps: SettingsStoreDeps): SettingsStore {
  const { platform, now, log } = deps;
  const path = settingsFilePath(platform);
  const mutex = createAsyncMutex();

  const read = async (): Promise<StateFileRead<Record<string, unknown>>> => {
    const result = await readStateFile<Record<string, unknown>>(
      platform.fs,
      path,
      settingsFileFormat,
      now(),
    );
    if (result.status === "recovered") {
      log(
        `settings.json was corrupt, kept as ${result.quarantinedAs}: ${result.details.join("; ")}`,
      );
    }
    return result;
  };

  const effective = (file: Record<string, unknown> | undefined): Settings => {
    const defaults = defaultSettings(platform);
    if (file === undefined) return defaults;
    // 只取认得且形状对的字段；更新版本写的文件里认不得的字段忽略，但不会被写回
    const parsed = settingsPatchSchema.safeParse(file);
    return { ...defaults, ...(parsed.success ? withoutUndefined(parsed.data) : {}) };
  };

  const viewOf = (result: StateFileRead<Record<string, unknown>>): Settings =>
    effective(
      result.status === "ok" ? result.value : result.status === "newer" ? result.raw : undefined,
    );

  return {
    get: async () => viewOf(await read()),
    set: (patch) =>
      mutex.run(async () => {
        const result = await read();
        if (result.status === "newer") throw newerVersionFailure("settings.json", result);
        const clean = withoutUndefined(patch);
        const next = {
          ...(result.status === "ok" ? result.value : {}),
          ...clean,
          formatVersion: SETTINGS_FILE_VERSION,
        };
        const merged = effective(next);
        if (merged.ports.min > merged.ports.max) {
          throw methodFailure("USAGE", {}, "ports.min must not exceed ports.max");
        }
        await writeStateFile(
          platform.fs,
          path,
          serializeVersioned(settingsFileFormat, next as never),
        );
        return merged;
      }),
  };
}
