// 在 utilityProcess 里把 Node 的 IPC（process.send / "message" 事件）接到 parentPort，
// 这样官方服务器的 --node-ipc（Vue）和 --useNodeIpc（tsserver）不用改代码就能用。
// 另外把联网的入口全部堵死（Node 24 的权限模型不管网络）。
const net = require("node:net");
const deny = () => { throw new Error("runyard: network disabled in language host"); };
net.connect = net.createConnection = deny;
net.Socket.prototype.connect = deny;
require("node:dns").lookup = deny;
globalThis.fetch = deny;
globalThis.WebSocket = undefined;
process.send = (m) => { process.parentPort.postMessage(m); return true; };
process.parentPort.on("message", (e) => process.emit("message", e.data));
const target = process.argv[2];
process.argv.splice(2, 1);
require(target);
