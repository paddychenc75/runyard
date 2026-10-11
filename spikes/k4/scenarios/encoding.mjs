// Windows 自带工具（cmd、PowerShell）的输出编码，以及“GBK 字节流能否被识别和解码”的离线自检。
import path from "node:path";
import { isWin } from "../lib/capture.mjs";
import { runCase } from "../lib/case.mjs";
import { withProfile } from "../lib/env.mjs";
import { toPlainLines } from "../lib/plain-text.mjs";
import { tryRun, which } from "../lib/tools.mjs";

export async function runWindowsNative(ctx) {
  if (!isWin) return ctx.skip("windows-native", "只在 Windows 上有意义");
  const comspec = process.env.ComSpec ?? "cmd.exe";
  const cases = [
    ["cmd-echo-default", comspec, ["/d", "/c", "echo 中文测试 & chcp"], ["中文测试"]],
    ["cmd-echo-chcp65001", comspec, ["/d", "/c", "chcp 65001 >nul & echo 中文测试 & chcp"], ["中文测试"]],
    ["cmd-dir-missing", comspec, ["/d", "/c", "dir X:\\不存在的目录"], []],
    ["powershell-write-output", "powershell.exe", ["-NoProfile", "-Command", "Write-Output '中文测试'; [Console]::OutputEncoding.CodePage"], ["中文测试"]],
    ["powershell-utf8-set", "powershell.exe", ["-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Write-Output '中文测试'"], ["中文测试"]],
  ];
  for (const [id, cmd, args, markers] of cases) {
    await runCase(ctx, { id: `win-native.${id}`, tool: "win-native", scenario: id, profile: "default", run: { cmd, args, cwd: ctx.base, env: withProfile({}) }, markers, keepFirstLines: 6 });
  }
}

/** 记录这台机器的代码页和语言（任务书要求：chcp、Console.OutputEncoding、WinSystemLocale、ACP）。 */
export function collectEncodingInfo() {
  const info = { platform: process.platform };
  if (!isWin) return info;
  const comspec = process.env.ComSpec ?? "cmd.exe";
  info.chcp = tryRun(comspec, ["/d", "/c", "chcp"]);
  const ps = (c) => tryRun("powershell.exe", ["-NoProfile", "-Command", c]);
  info.consoleOutputEncoding = ps("[Console]::OutputEncoding.WebName + ' / ' + [Console]::OutputEncoding.CodePage");
  info.psDefaultEncoding = ps("[Text.Encoding]::Default.WebName + ' / ' + [Text.Encoding]::Default.CodePage");
  info.winSystemLocale = ps("(Get-WinSystemLocale).Name");
  info.culture = ps("(Get-Culture).Name + ' / UI ' + (Get-UICulture).Name");
  info.regACP_OEMCP = tryRun("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "ACP"]) + " | " + tryRun("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "OEMCP"]);
  const py = which("python");
  if (py) info.pythonLocale = tryRun(py, ["-c", "import locale,sys;print('preferred=',locale.getpreferredencoding(False),'utf8_mode=',sys.flags.utf8_mode,'stdout_enc(pipe)=',sys.stdout.encoding)"]);
  return info;
}

/** 离线自检：不依赖任何外部程序，验证清洗规则本身。返回 [{name, ok, detail}]。 */
export function selfTest() {
  const enc = (s) => Buffer.from(s, "utf8");
  const gbk = (hexArr) => Buffer.from(hexArr); // 手写的 GBK 字节
  // “中文测试” 的 GBK：D6 D0 CE C4 B2 E2 CA D4
  const GBK_ZHONGWEN = [0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4];
  const mk = (parts, src = "stdout") => parts.map((b, i) => ({ t: i, src, buf: Buffer.isBuffer(b) ? b : enc(b) }));
  const tests = [];
  const t = (name, chunks, expectLines, expectEnc) => {
    const got = toPlainLines(chunks);
    const texts = got.map((l) => l.text);
    const ok = JSON.stringify(texts) === JSON.stringify(expectLines) && (!expectEnc || got.every((l) => l.encoding === expectEnc));
    tests.push({ name, ok, detail: ok ? undefined : JSON.stringify({ texts, expectLines, enc: got.map((l) => l.encoding) }) });
  };
  t("颜色码被剥掉", mk(["\u001b[31m红\u001b[0m 字\n"]), ["红 字"]);
  t("光标移动与清屏被剥掉", mk(["\u001b[2J\u001b[3J\u001b[H\u001b[1A\u001b[2Kready\n"]), ["ready"]);
  t("OSC 8 超链接只留文字（BEL 结尾）", mk(["\u001b]8;;http://127.0.0.1:1/\u0007链接\u001b]8;;\u0007\n"]), ["链接"]);
  t("OSC 8 超链接只留文字（ESC \\ 结尾）", mk(["\u001b]8;;http://x\u001b\\链接\u001b]8;;\u001b\\\n"]), ["链接"]);
  t("CRLF 归一为一行", mk(["a\r\nb\r\n"]), ["a", "b"]);
  t("CRLF 的 CR 与 LF 被拆在两个数据块", mk(["a\r", "\nb\n"]), ["a", "b"]);
  t("回车重画只留最后状态", mk(["进度 0%\r进度 50%\r进度 100%\n"]), ["进度 100%"]);
  t("CSI 1G 等同回车", mk(["x 1\u001b[1Gx 2\u001b[2K\n"]), ["x 2"]);
  t("汉字的 UTF-8 字节被拆在两个数据块", mk([enc("中文").subarray(0, 4), enc("中文").subarray(4), "\n"]), ["中文"], "utf-8");
  t("转义序列被拆在两个数据块", mk(["\u001b[3", "1m红\u001b[0m\n"]), ["红"]);
  t("GBK 字节流（模拟中文 Windows）被识别并解码", mk([gbk([...GBK_ZHONGWEN, 0x0a])]), ["中文测试"], "gb18030");
  t("同一流里 UTF-8 行和 GBK 行交替", mk([enc("utf8 行\n"), gbk([...GBK_ZHONGWEN, 0x0a]), enc("再一行\n")]), ["utf8 行", "中文测试", "再一行"]);
  t("GBK 汉字被拆在两个数据块", mk([gbk(GBK_ZHONGWEN.slice(0, 3)), gbk([...GBK_ZHONGWEN.slice(3), 0x0a])]), ["中文测试"], "gb18030");
  t("没有结尾换行的最后半行也输出", mk(["最后一行没有换行"]), ["最后一行没有换行"]);
  t("BOM 被去掉", mk([Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), enc("文本\n")])]), ["文本"]);
  t("纯控制序列的行被丢弃但空行保留", mk(["\u001b[2K\n\nx\n"]), ["", "x"]);
  t("stdout 与 stderr 的半行互不串", [{ t: 0, src: "stdout", buf: enc("out-") }, { t: 1, src: "stderr", buf: enc("err\n") }, { t: 2, src: "stdout", buf: enc("rest\n") }], ["err", "out-rest"]);
  // 已知限制：GBK 字节恰好也构成合法 UTF-8 时会被当 UTF-8，这里只记录，不当作失败
  const ambiguous = toPlainLines(mk([gbk([0xc3, 0xa9, 0x0a])]))[0];
  tests.push({ name: "已知限制：恰好合法的 UTF-8 的 GBK 字节会被当 UTF-8（0xC3 0xA9）", ok: true, detail: `解成 ${JSON.stringify(ambiguous.text)}（${ambiguous.encoding}）` });
  return tests;
}
