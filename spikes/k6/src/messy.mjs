// 第 4 项：杂乱的启动文件。基底是"nvm 默认 22.1.0"，在上面叠加一种捣乱的写法，看解析器能否仍拿到 22.1.0。
import { execFileSync } from "node:child_process";
import { makeSandbox, shellPath, finderEnv, groundTruth } from "./lab.mjs";
import { resolveLoginEnv } from "./resolve-env.mjs";
import { detectAll, scanFallbackEnv } from "./tools.mjs";

const P = (posix, fish) => ({ posix, fish });
const EXPECT = "22.1.0";

function base(c) {
  c.tool(".nvm/versions/node/v22.1.0/bin/node", "v22.1.0");
  c.add("rc", { posix: `export PATH="$HOME/.nvm/versions/node/v22.1.0/bin:$PATH"`, fish: `set -gx PATH $HOME/.nvm/versions/node/v22.1.0/bin $PATH` });
}
const everywhere = (c, t) => { for (const s of ["env", "profile", "rc"]) c.add(s, t); };
const SLEEP_MARK = (n) => `sleep ${n}`;

// before：在基底之前加；after：在基底之后加（有的捣乱要放最后，比如 exit、exec）
export const MESSY = [
  { id: "stray-output", title: "启动文件前后向 stdout 和 stderr 打杂音（每个文件都有）",
    before: (c) => everywhere(c, P('echo "STRAY-OUT-BEFORE"; echo "STRAY-ERR-BEFORE" >&2', 'echo STRAY-OUT-BEFORE; echo STRAY-ERR-BEFORE >&2')),
    after: (c) => everywhere(c, P('echo "STRAY-OUT-AFTER"; echo "STRAY-ERR-AFTER" >&2; printf "no-newline-tail"', 'echo STRAY-OUT-AFTER; echo STRAY-ERR-AFTER >&2; printf no-newline-tail')) },
  { id: "marker-lookalike", title: "启动文件打印长得像标记的文字；环境变量值里含标记前缀和换行",
    before: (c) => c.add("rc", P('echo "__RUNYARD_ENV_deadbeef_START__ x __RUNYARD_ENV_deadbeef_END__"\nexport EVIL=$\'line1\\n__RUNYARD_ENV_0000_START__\\nline3\'\nexport EVIL2="a=b=c"', 'echo "__RUNYARD_ENV_deadbeef_START__ x __RUNYARD_ENV_deadbeef_END__"; set -gx EVIL (printf "line1\\n__RUNYARD_ENV_0000_START__\\nline3" | string collect)')),
    check: (env) => (env.EVIL?.includes("line3") ? "EVIL 值完整（含换行）" : "EVIL 值丢失/被截断: " + JSON.stringify(env.EVIL)) },
  { id: "slow-3s", title: "启动文件里 sleep 3（超过 2 秒预算、低于 10 秒超时）", before: (c) => c.add("rc", SLEEP_MARK("3.11")), cleanup: "sleep 3.11" },
  { id: "slow-15s", title: "启动文件里 sleep 15（超过 10 秒超时）", timeoutMs: 10000, before: (c) => c.add("rc", SLEEP_MARK("15.13")), cleanup: "sleep 15.13", expectFail: true },
  { id: "read-stdin", title: "启动文件向 stdin 读一行（提示用户输入）", before: (c) => c.add("rc", P('if [ -n "$ZSH_VERSION" ]; then read -r "?Update now? [y/n] " __ans; else read -r -p "Update now? [y/n] " __ans; fi', 'read -P "Update now? " __ans')) },
  { id: "read-q-ohmyzsh", title: "oh-my-zsh 式更新提示：read -q，且在 .zprofile 里", only: ["zsh"], before: (c) => c.add("profile", 'read -q "?Update oh-my-zsh? [Y/n] "') },
  { id: "compinit-insecure", title: "zsh compinit 遇到不安全目录，会问 \"Ignore insecure directories and files and continue? [ny]\"", only: ["zsh"],
    before: (c) => { c.write("insecure/_foo", "#compdef foo\n"); c.add("rc", `chmod 777 "$HOME/insecure"; chmod 666 "$HOME/insecure/_foo"; fpath=("$HOME/insecure" $fpath); autoload -Uz compinit; compinit`); } },
  { id: "exit-3", title: "rc 末尾 exit 3（基底已加载完）", terminalBroken: "终端用户自己的 shell 也会立刻退出",  after: (c) => c.add("rc", "exit 3"), expectDegraded: true },
  { id: "set-e-fail", title: "rc 里 set -e 然后一条失败的命令", terminalBroken: "终端里 shell 也会退出",  after: (c) => c.add("rc", P("set -e\nfalse\necho unreachable", "false")), expectDegraded: true },
  { id: "set-u-unbound", title: "rc 里 set -u 然后引用未定义变量", terminalBroken: "zsh 里终端也会中止 rc 的其余部分",  only: ["zsh", "bash"], after: (c) => c.add("rc", 'set -u\necho "$UNDEFINED_VAR_K6"\nset +u'), expectDegraded: true },
  { id: "syntax-error", title: "rc 里有语法错误（错误之后的内容在终端里同样不会执行）", terminalBroken: "终端里同样拿不到 node（语法错误后面的内容不执行）；这里基底在错误之后", only: ["zsh", "bash"], before: (c) => c.add("rc", "if [ then fi ]]") },
  { id: "exec-other-shell", title: "rc 末尾 exec 另一个 shell（zsh→bash，bash→zsh）：-c 的命令被吞掉", terminalNote: "终端用户其实就是在用被 exec 出来的那个 shell", only: ["zsh", "bash"],
    after: (c) => c.add("rc", c.kind === "zsh" ? "exec /bin/bash -l" : "exec /bin/zsh -l"), expectDegraded: true },
  { id: "exec-fish", title: "rc 末尾 exec fish（需要装了 fish，CI）", terminalNote: "终端用户其实就是在用 fish", only: ["zsh", "bash"], when: () => !!shellPath("fish"),
    after: (c) => c.add("rc", `exec ${shellPath("fish")}`), expectDegraded: true },
  { id: "background-job", title: "rc 里放出一个后台任务，继承了 stdout（管道一直不关）", before: (c) => c.add("rc", P("(sleep 17.7 &)", "sleep 17.7 &"), ), cleanup: "sleep 17.7" },
  { id: "big-env-800k", title: "一个 800 KB 的环境变量（macOS ARG_MAX 约 1 MB）", before: (c) => c.add("rc", P(`export BIGVAR=$(head -c 800000 /dev/zero | tr '\\0' x)`, `set -gx BIGVAR (head -c 800000 /dev/zero | tr '\\0' x)`)),
    check: (env) => `BIGVAR 长度 ${env.BIGVAR?.length ?? "缺失"}` },
  { id: "many-vars", title: "5000 个环境变量（共约 400 KB）", before: (c) => c.add("rc", P(`for i in $(seq 1 5000); do export "K6VAR_$i=value-value-value-value-value-value-value-value-$i"; done`, `for i in (seq 1 5000); set -gx K6VAR_$i value-value-value-value-value-value-value-value-$i; end`)),
    check: (env) => `K6VAR 个数 ${Object.keys(env).filter((k) => k.startsWith("K6VAR_")).length}` },
  { id: "non-utf8", title: "环境变量值里有非 UTF-8 字节（\\xe9）", before: (c) => c.add("rc", P(`export LATIN=$(printf 'caf\\351')`, `set -gx LATIN (printf 'caf\\351')`)),
    check: (env, meta) => `LATIN=${JSON.stringify(env.LATIN)} lossy=${meta.lossy}` },
  { id: "osc-sequences", title: "iTerm2 / VS Code 式 shell integration：启动时和 precmd 里输出 OSC 转义序列",
    before: (c) => c.add("rc", P(`printf '\\033]1337;ShellIntegrationVersion=18;shell=zsh\\007'; printf '\\033]633;A\\007\\033]133;A\\033\\\\'; printf '\\033[?2004h\\033]0;title\\007'\n_k6_pre(){ printf '\\033]1337;RemoteHost=u@h\\007\\033]633;P;Cwd=/x\\007'; }\nif [ -n "$ZSH_VERSION" ]; then precmd_functions+=(_k6_pre); else PROMPT_COMMAND="_k6_pre"; fi`, `printf '\\033]1337;ShellIntegrationVersion=18\\007\\033]633;A\\007\\033[?2004h'`)) },
  { id: "starship-real", title: "真实 starship（本机已装 /opt/homebrew/bin/starship）：eval \"$(starship init zsh)\"", only: ["zsh", "bash"], when: () => !!process.env.K6_HAVE_STARSHIP,
    after: (c) => c.add("rc", c.kind === "zsh" ? 'eval "$(starship init zsh)"' : 'eval "$(starship init bash)"') },
  { id: "p10k-instant-prompt-real", title: "真实 powerlevel10k 的 instant prompt（已知会破坏环境捕获）：先开一次交互会话生成缓存，再解析", only: ["zsh"], when: () => !!process.env.K6_P10K_DIR,
    before: (c) => {
      c.write(".p10k.zsh", "() { emulate -L zsh; typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(dir); typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(); typeset -g POWERLEVEL9K_INSTANT_PROMPT=verbose }\n");
      c.add("rc", `if [[ -r "\${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-\${(%):-%n}.zsh" ]]; then source "\${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-\${(%):-%n}.zsh"; fi`);
    },
    after: (c) => c.add("rc", `source ${process.env.K6_P10K_DIR}/powerlevel10k.zsh-theme\n[[ -f ~/.p10k.zsh ]] && source ~/.p10k.zsh`),
    prime: true },
  { id: "tty-needing-calls", title: "rc 里调 stty / tput / tty（没有控制终端会报错）", only: ["zsh", "bash"], before: (c) => c.add("rc", 'stty -ixon 2>&1; tput cols; tty; echo "COLUMNS=$COLUMNS"') },
];

export async function runMessy(kinds, extraOpts = {}) {
  const rows = [];
  for (const m of MESSY) {
    for (const kind of kinds) {
      if (!shellPath(kind)) continue;
      if (m.only && !m.only.includes(kind)) continue;
      if (m.when && !m.when()) continue;
      const c = makeSandbox(`messy-${m.id}`, kind);
      m.before?.(c);
      base(c);
      m.after?.(c);
      c._finish();
      if (m.prime) groundTruth(kind, c.home, c.home, 15); // 开一次真正的交互会话，让 p10k 写出 instant prompt 缓存
      const baseEnv = finderEnv(c.home);
      const res = await resolveLoginEnv({ baseEnv, cwd: c.home, shell: shellPath(kind), timeoutMs: m.timeoutMs ?? 10000, ...extraOpts });
      const det = res.env ? await detectAll(res.env, c.home) : null;
      const scan = await detectAll(scanFallbackEnv(c.home, baseEnv), c.home);
      const { env, ...meta } = res;
      let leftover = "";
      if (m.cleanup) { try { leftover = execFileSync("/usr/bin/pgrep", ["-f", m.cleanup]).toString().trim().split("\n").join(","); } catch {} }
      const row = {
        id: m.id, kind, ms: Math.round(res.ms), ok: res.ok, reason: res.reason, degraded: !!res.degraded, timedOut: !!res.timedOut, firstAttempt: res.firstAttempt,
        node: det?.node?.version ?? null, nodeOk: det?.node?.version === EXPECT, scanNode: scan.node?.version ?? null,
        terminalBroken: m.terminalBroken, terminalNote: m.terminalNote, noiseBytes: res.noiseBytes, stderrTail: meta.stderrTail?.slice(0, 120), check: m.check && env ? m.check(env, res) : undefined, leftoverProcs: leftover || 0,
      };
      rows.push(row);
      console.log(`${row.nodeOk ? "OK  " : m.terminalBroken ? "n/a " : "FAIL"} ${m.id} [${kind}] ${row.ms}ms ok=${row.ok} degraded=${row.degraded} reason=${row.reason ?? ""} node=${row.node} scanNode=${row.scanNode}${row.check ? " | " + row.check : ""}${row.leftoverProcs ? " LEFTOVER=" + row.leftoverProcs : ""}`);
      if (leftover) { // 清理：只杀 pgrep 到的、命令行含我们独有 sleep 参数的进程
        for (const pid of leftover.split(",")) { try { process.kill(Number(pid), "SIGKILL"); } catch {} }
      }
    }
  }
  return rows;
}
