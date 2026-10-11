import trash from "trash";
try {
  await trash(process.argv[2], { glob: false });
} catch (e) {
  // 只打印外部程序的错误输出，不要整段堆栈
  console.error("npm-trash-error:", String(e.stderr || e.stdout || e.message).slice(0, 300));
  process.exit(1);
}
