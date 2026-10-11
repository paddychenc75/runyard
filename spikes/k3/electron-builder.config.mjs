// K3 的 electron-builder 配置（26.17.0）。变体由环境变量选，scripts/build.mjs 负责设置它们。
//   K3_VERSION   这一份构建的版本号（模拟“新版本”用）
//   K3_STAGE     放 build-info.json 的临时目录（版本号、协议版本），会被复制进 resources/runtime
//   K3_FUSES     strict（默认）| norunasnode（对照：关掉 runAsNode 看什么会坏）| none（不动任何开关）
//                | strict-noreset（对照：改了开关但不重置 ad-hoc 签名）
//                | strict-filepriv（对照：只把 grantFileProtocolExtraPrivileges 留着）
//   K3_IDENTITY  default（什么都不写，看打包工具自己怎么做）| null（明确不签）| adhoc（明确 ad-hoc）
//   K3_NSIS_VARIANT  hook | default | nocheck（见 build/installer.nsh）
const env = process.env;
const fusesMode = env.K3_FUSES ?? "strict";
const identityMode = env.K3_IDENTITY ?? "default";

// 打包开关（fuse）。runAsNode 必须保持开：管理进程和内置命令行都靠 ELECTRON_RUN_AS_NODE=1（§6.5）
const fuses =
  fusesMode === "none"
    ? undefined
    : {
        runAsNode: fusesMode !== "norunasnode",
        enableCookieEncryption: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        loadBrowserProcessSpecificV8Snapshot: false,
        grantFileProtocolExtraPrivileges: fusesMode === "strict-filepriv",
        // 改开关会改动 Electron Framework 这个二进制，它原有的 ad-hoc 签名随之失效；让工具当场重签
        resetAdHocDarwinSignature: fusesMode !== "strict-noreset",
      };

const macIdentity = identityMode === "null" ? { identity: null } : identityMode === "adhoc" ? { identity: "-" } : {};

export default {
  appId: "dev.runyard.spike.k3",
  productName: "RunyardK3",
  extraMetadata: { version: env.K3_VERSION ?? "0.3.0" },
  directories: { output: env.K3_OUT ?? "dist", buildResources: "build" },
  // 进 asar 的只有应用自己的代码；node_modules 里的正式依赖（chokidar 和它的依赖）由打包工具自己收集
  files: ["app/**", "package.json"],
  asar: true,
  // 管理进程和命令行是普通的 JS 文件，放在 asar 外面的 resources/runtime（§8.2）：K1 的代码原样复制
  extraResources: [
    { from: "../k1", to: "runtime", filter: ["supervisor.mjs", "cli.mjs", "lib/client.mjs", "lib/config.mjs", "lib/instance-lock.mjs", "lib/wire.mjs"] },
    { from: "runtime", to: "runtime" },
    { from: env.K3_STAGE ?? "stage", to: "runtime", filter: ["build-info.json"] },
  ],
  // 链接协议。实验用 runyard-k3://，不占正式的 runyard://，免得在负责人的电脑上留下处理程序
  protocols: [{ name: "Runyard K3 spike", schemes: ["runyard-k3"] }],
  electronFuses: fuses,
  // 不发布、不生成自动更新用的文件
  publish: null,
  mac: {
    category: "public.app-category.developer-tools",
    artifactName: "${productName}-${version}-mac-${arch}.${ext}",
    extraResources: [{ from: "bin/mac", to: "bin" }],
    // 不做公证，不要强化运行时（那是给正式签名用的）
    hardenedRuntime: false,
    notarize: false,
    ...macIdentity,
  },
  dmg: { sign: false, writeUpdateInfo: false },
  win: {
    artifactName: "${productName}-${version}-win-${arch}-setup.${ext}",
    // bin 放在安装目录的根下，和 §5.4 写的一致（“把安装目录下的 bin 加进用户的 PATH”）
    extraFiles: [{ from: "bin/win", to: "bin" }],
  },
  nsis: {
    oneClick: true,
    perMachine: false, // 按用户安装，不需要管理员
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
    differentialPackage: false,
    include: "build/installer.nsh",
  },
};
