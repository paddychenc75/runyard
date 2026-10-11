// 冒充者：抢先在管理进程的连接点上监听。把收到的每个字节记下来，供事后检查口令有没有被发出来。
// 用法：node squatter.mjs <连接点> <模式> <记录文件>
//   silent    接受连接，一句话不说
//   garbage   回一段不是协议的内容
//   fake      发一个像样的质询，再回一个随便编的应答
//   reflect   发一个 nonce 为空的质询，再把客户端的 proof 原样发回去（针对 §5.1 原文算法的反射）
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";

const [endpoint, mode, recordFile] = process.argv.slice(2);
const line = (obj) => `${JSON.stringify(obj)}\n`;
const welcome = (proof) => line({ t: "welcome", proof, pid: process.pid, instanceId: "squatter", protocol: 1, minClientProtocol: 1, product: "squatter", launcher: "squatter", runs: 0 });

net
  .createServer((socket) => {
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      fs.appendFileSync(recordFile, chunk);
      let hello = null;
      try {
        hello = JSON.parse(chunk.toString("utf8").split("\n")[0]);
      } catch {
        return;
      }
      if (hello?.t !== "hello") return;
      if (mode === "fake") socket.write(welcome(crypto.randomBytes(32).toString("base64")));
      if (mode === "reflect") socket.write(welcome(hello.proof));
    });
    if (mode === "garbage") socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    if (mode === "fake") socket.write(line({ t: "challenge", nonce: crypto.randomBytes(32).toString("base64"), protocol: 1, minClientProtocol: 1 }));
    if (mode === "reflect") socket.write(line({ t: "challenge", nonce: "", protocol: 1, minClientProtocol: 1 }));
  })
  .listen(endpoint, () => {
    fs.appendFileSync(recordFile, "");
    process.stdout.write("ready\n");
  });
