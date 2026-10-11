// 环境变量：以“干净的用户环境”为底，去掉会改变颜色、缓冲、编码行为的变量，
// 否则 GitHub 的运行器（CI=true、GITHUB_ACTIONS=true）会让工具以为自己在 CI 里而改变输出，测出来的不是用户机器上的样子。
const STRIP = /^(CI|TF_BUILD|GITHUB_ACTIONS|GITLAB_CI|TRAVIS|CIRCLECI|APPVEYOR|BUILDKITE|TEAMCITY_VERSION|NO_COLOR|FORCE_COLOR|NODE_DISABLE_COLORS|NODE_FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|COLORTERM|TERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|WT_SESSION|ANSICON|ConEmuANSI|PYTHON(UTF8|IOENCODING|UNBUFFERED|COLORS|LEGACYWINDOWSSTDIO|WARNINGS)|NEXT_TELEMETRY_DISABLED|NODE_OPTIONS|NODE_ENV|INIT_CWD|ELECTRON_RUN_AS_NODE|npm_.*|PNPM_.*|NPM_CONFIG_.*|UV_.*)$/i;

export function cleanBaseEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!STRIP.test(k)) env[k] = v;
  return { ...env, ...extra };
}

// 环境变量档位。default 是“用户双击启动、什么都不设”的样子；其余是被测的单项或组合。
export const COLOR_PROFILES = {
  default: {},
  "force-color": { FORCE_COLOR: "1" },
  "no-color": { NO_COLOR: "1" },
  "force-color-0": { FORCE_COLOR: "0" },
  "ci-1": { CI: "1" },
  "term-dumb": { TERM: "dumb" },
};

// 推荐组合 B：不要颜色（日志最小）。A：保留颜色给界面渲染，读取时再剥（技术设计 §4.5 现行写法是“强制颜色”）。
export const REC_NOCOLOR = {
  NO_COLOR: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  PYTHONUTF8: "1",
  PYTHONUNBUFFERED: "1",
  PYTHONIOENCODING: "utf-8",
};
export const REC_COLOR = { ...REC_NOCOLOR, NO_COLOR: undefined, FORCE_COLOR: "1" };

export function withProfile(profileEnv, extra = {}) {
  const env = cleanBaseEnv({ ...profileEnv, ...extra });
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env;
}
