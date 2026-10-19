import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { app } from "electron";
import { VUE_LANGUAGE_SERVICE_DIR } from "../vue-language/service-paths.ts";
import { VueProjects } from "../vue-language/vue-projects.ts";
import { createVueSession } from "../vue-language/vue-session.ts";
import { launchLanguageProcess } from "./vue-process.ts";

/** 源码与正式包用同一份受限入口；构建阶段生成目录，运行时不复制、不下载。 */
export function createVueLanguageHost(home: string, distDir: string): VueProjects {
  const platform = getPlatform({ home: absPath(home) });
  const service = app.isPackaged
    ? join(process.resourcesPath, VUE_LANGUAGE_SERVICE_DIR)
    : join(distDir, VUE_LANGUAGE_SERVICE_DIR);
  return new VueProjects((folder, failed) =>
    createVueSession({
      folder,
      failed,
      launch: (target) =>
        launchLanguageProcess({
          target,
          project: folder,
          service,
          executable: process.execPath,
          platform,
          home,
        }),
    }),
  );
}
