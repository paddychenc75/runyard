// 语言服务进程不许联网（Node 24 的权限模型不管网络，这里补上）
const net = require("node:net");
const deny = () => { throw new Error("network disabled in language host"); };
net.connect = net.createConnection = deny;
net.Socket.prototype.connect = deny;
require("node:dns").lookup = deny;
require("node:dns").resolve = deny;
globalThis.fetch = deny;
