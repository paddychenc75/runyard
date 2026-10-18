const { app, utilityProcess } = require("electron");
const { join } = require("node:path");
app.whenReady().then(() => {
  const p = utilityProcess.fork(join(__dirname, "perm-child.cjs"), [], { execArgv: ["--permission", `--allow-fs-read=${__dirname}`], stdio: "pipe" });
  p.stdout.on("data", (d) => console.log(String(d).trim()));
  p.stderr.on("data", (d) => console.log("ERR", String(d).trim().slice(0, 300)));
  p.on("exit", (c) => { console.log("exit", c); app.quit(); });
});
