// 以“另一个系统用户”的身份运行：试着连管理进程的连接点、读发现文件，打印一行 JSON。
// 用法：node other-user-probe.mjs <连接点> <发现文件>
import fs from "node:fs";
import net from "node:net";
import os from "node:os";

const [endpoint, discovery] = process.argv.slice(2);
const out = { user: os.userInfo().username, connect: null, received: null, write: null, readDiscovery: null };
try {
  fs.readFileSync(discovery);
  out.readDiscovery = "ok";
} catch (err) {
  out.readDiscovery = err.code;
}
const socket = net.connect(endpoint);
const finish = () => {
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(0);
};
socket.on("error", (err) => {
  if (out.connect === null) out.connect = err.code;
  else out.write = `error:${err.code}`;
  finish();
});
socket.on("connect", () => {
  out.connect = "ok";
  socket.on("data", (d) => {
    out.received = d.toString("utf8").slice(0, 40);
    // 连上了也收到了质询：没有口令，随便回一个，看管理进程怎么处理
    socket.write(`${JSON.stringify({ t: "hello", clientNonce: Buffer.alloc(32).toString("base64"), proof: Buffer.alloc(32).toString("base64") })}\n`, (err) => {
      out.write = err ? `error:${err.code}` : "written";
    });
  });
  socket.on("close", () => {
    out.closedByPeer = true;
    finish();
  });
  setTimeout(finish, 2500);
});
setTimeout(finish, 5000);
