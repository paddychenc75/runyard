// 测试用的样例：docs/architecture/runner-format.md 里的两个完整运行器，加一个静态页面运行器、
// 一份对应的 template.json 和一份工具定义。内容取自文档，不是真实内置模板（那些随 TP 系列加入）。
// 只被 *.test.ts 导入。

export const sampleViteRunner = {
  formatVersion: 1,
  id: "vite",
  kind: "server",
  needs: ["node", { anyOf: ["pnpm", "npm"] }],
  setup: {
    inputs: ["package.json", "pnpm-lock.yaml", "package-lock.json"],
    stamp: "node_modules/.runyard-setup.json",
    variants: {
      pnpm: { command: ["pnpm", "install", "--prefer-offline"] },
      npm: { command: ["npm", "install", "--prefer-offline", "--no-audit", "--no-fund"] },
    },
    errors: [
      {
        match: "ERR_PNPM_NO_OFFLINE_TARBALL|ENOTCACHED|ENOTFOUND|EAI_AGAIN",
        reason: "DEPS_OFFLINE",
      },
      { match: "VCRUNTIME140|The specified module could not be found", reason: "RUNTIME_MISSING" },
    ],
  },
  run: {
    command: [
      "node",
      "node_modules/vite/bin/vite.js",
      "--port",
      "{port}",
      "--strictPort",
      "--host",
      "127.0.0.1",
      "--clearScreen",
      "false",
    ],
  },
  ready: { http: { path: "/" }, slowAfterMs: 30000 },
  preview: { type: "web", path: "/" },
  watch: { mode: "none" },
  stop: { mode: "graceful", graceMs: 2000 },
};

export const samplePythonRunner = {
  formatVersion: 1,
  id: "python-file",
  kind: "oneshot",
  needs: ["python"],
  check: {
    command: [
      "python",
      "-c",
      "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read(),sys.argv[1])",
      "{entry}",
    ],
    timeoutMs: 5000,
  },
  run: {
    command: ["python", "-u", "{entry}"],
    env: { PYTHONDONTWRITEBYTECODE: "1" },
    stdin: true,
  },
  preview: { type: "console" },
  watch: {
    mode: "rerun",
    paths: ["**/*.py"],
    ignore: [".venv/**", "__pycache__/**"],
    debounceMs: 300,
  },
  stop: { mode: "graceful", graceMs: 2000 },
};

export const sampleStaticRunner = {
  formatVersion: 1,
  id: "static-page",
  kind: "static",
  needs: [],
  preview: { type: "web", path: "/" },
  watch: { mode: "none" },
  stop: { mode: "graceful" },
};

export const sampleTemplate = {
  formatVersion: 1,
  id: "react19",
  name: { en: "React 19", "zh-CN": "React 19" },
  description: "React 19 with Vite",
  category: "frontend",
  runner: "vite",
  requires: {
    node: { version: ">=22.18 <27" },
    pnpm: { version: ">=10.34.6 <12", fallback: "npm" },
  },
  entry: "src/App.tsx",
  variables: { title: "Hello" },
  substitute: ["index.html"],
  maintainer: "Runyard",
};

export const sampleToolDefinition = {
  formatVersion: 1,
  id: "node",
  supported: ">=22 <27",
  detect: { args: ["--version"], pattern: "v(\\d+\\.\\d+\\.\\d+)" },
  install: {
    darwin: {
      url: "https://nodejs.org/en/download",
      versionManagers: [{ id: "nvm", command: ["nvm", "install", "24"] }],
      homebrew: { command: ["brew", "install", "node@24"] },
    },
  },
};

// 工具定义里的工具标识，lint 时用来判断 tool-unknown
export const sampleKnownTools: ReadonlySet<string> = new Set([
  "node",
  "pnpm",
  "npm",
  "python",
  "uv",
  "go",
]);
