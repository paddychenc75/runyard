// 被"模拟 Finder 启动"的进程调用：打印它实际收到的环境概况，并用解析器解析、检测。
// 用法：node cli.mjs [--cwd DIR] [--timeout MS]
import { resolveLoginEnv, findLoginShell } from "./resolve-env.mjs";
import { detectAll } from "./tools.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const cwd = arg("--cwd", process.env.HOME);
const received = { keys: Object.keys(process.env).sort(), PATH: process.env.PATH, SHELL: process.env.SHELL ?? null, TERM: process.env.TERM ?? null, HOME: process.env.HOME ?? null, TERM_PROGRAM: process.env.TERM_PROGRAM ?? null };
const t0 = performance.now();
const log = (m) => console.error(`[${Math.round(performance.now() - t0)}ms] ${m}`);
log('start');
const login = findLoginShell(process.env);
log('login ' + JSON.stringify(login));
const res = await resolveLoginEnv({ baseEnv: process.env, cwd, timeoutMs: Number(arg("--timeout", 10000)) });
log('resolved ' + res.ok + ' ' + res.reason);
const tools = res.env ? await detectAll(res.env, cwd) : null;
const { env, ...meta } = res;
console.log(JSON.stringify({ received, login, meta, tools, totalMs: Math.round(performance.now() - t0) }, null, 1));
