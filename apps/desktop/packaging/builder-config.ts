import { join } from "node:path";
import type { Configuration } from "electron-builder";
import { electronFusesOption, type FuseSettings } from "./fuses.ts";

// electron-builder 的配置（只打 macOS；Windows 以后，技术设计 §8.2）。
// 应用目录是临时拼出来的（package.ts 的 stage），里面只有 esbuild 的产物和一个最小的 package.json，
// 所以不会把工作区的依赖链接带进包里；主进程、预加载脚本、界面都已经打成了单文件。

export interface BuilderInputs {
  /** 安装包与 .app 的输出目录 */
  outDir: string;
  /** 图标等打包资源所在目录（apps/desktop/build） */
  buildResources: string;
  /** 已下载的 Electron 目录（node_modules/electron/dist），使用它就不会在打包时再联网 */
  electronDist: string;
  electronVersion: string;
  fuses: Readonly<FuseSettings>;
  /** runtime-bundle.ts 的输出目录：里面的 runyard/ 和 bin/ 作为额外资源放进 Contents/Resources */
  runtimeDir: string;
}

export function builderConfig(inputs: BuilderInputs): Configuration {
  return {
    appId: "app.runyard.desktop",
    productName: "Runyard",
    directories: {
      output: inputs.outDir,
      buildResources: inputs.buildResources,
    },
    electronVersion: inputs.electronVersion,
    electronDist: inputs.electronDist,
    files: ["dist/**/*", "package.json", "!**/*.map"],
    asar: true,
    electronFuses: electronFusesOption(inputs.fuses),
    // 管理进程、命令行、模板数据和启动脚本放在 asar 之外：应用的可执行文件要把它们当 Node 脚本直接运行
    extraResources: [
      { from: join(inputs.runtimeDir, "runyard"), to: "runyard" },
      { from: join(inputs.runtimeDir, "bin"), to: "bin" },
    ],
    npmRebuild: false,
    mac: {
      category: "public.app-category.developer-tools",
      icon: "icon.png",
      // 没有开发者证书时 electron-builder 26.17.0 不会自动 ad-hoc 签名（决策记录 0007 第 1 条、K3 实测）：
      // 明确写 "-"；打包后 package.ts 用 codesign --verify --deep --strict 校验
      identity: "-",
      target: [
        { target: "dmg", arch: ["arm64"] },
        { target: "zip", arch: ["arm64"] },
      ],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 这是 electron-builder 自己替换的占位符，不是模板字符串
      artifactName: "Runyard-${version}-mac-${arch}.${ext}",
    },
  };
}
