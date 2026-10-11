// Node + TypeScript 探针：node 24 直接运行 .ts（去类型），不经过 shell。
// 子命令的含义见 README；三种语言（prog.ts / prog.py / main.go）的子命令保持一致。
const [cmd = "hello", a = "6", b = "50"] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (cmd === "hello") {
  console.log("中文测试：你好，世界 ASCII ok");
  console.error("中文错误输出（stderr）：标准错误");
  console.log({ 名称: "运行场", n: 1, nested: { 列表: [1, 2, 3] } });
} else if (cmd === "symbols") {
  // GBK 编码里没有这些符号：中文 Windows 上 Python 会因此崩溃，要单独测
  console.log("symbols ✓ ✗ → … 😀 ▲ ⨯");
} else if (cmd === "error") {
  console.log("before error 中文测试");
  function inner(): never {
    throw new Error("中文错误：出错了");
  }
  inner();
} else if (cmd === "progress") {
  for (let i = 0; i <= 5; i++) {
    process.stdout.write(`\r进度 ${i * 20}%`);
    await sleep(30);
  }
  process.stdout.write("\n完成\n");
} else if (cmd === "tick") {
  for (let i = 1; i <= Number(a); i++) {
    console.log(`tick ${i} ${Date.now()} 中文`);
    await sleep(1000);
  }
} else if (cmd === "interleave") {
  for (let i = 1; i <= Number(a); i++) {
    (i % 2 ? console.log : console.error)(`seq ${i} ${i % 2 ? "out" : "err"}`);
    if (Number(b) > 0) await sleep(Number(b));
  }
} else if (cmd === "hang") {
  for (let i = 1; i <= Number(a); i++) console.log(`line ${i} before-kill 中文`);
  await sleep(60000);
}
