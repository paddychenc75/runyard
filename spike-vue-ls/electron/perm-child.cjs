console.log("execArgv", JSON.stringify(process.execArgv), "permission api", typeof process.permission, process.versions.node);
try { require("node:fs").readFileSync("/etc/hosts"); console.log("read /etc/hosts: ALLOWED"); } catch (e) { console.log("read /etc/hosts:", e.code); }
process.exit(0);
