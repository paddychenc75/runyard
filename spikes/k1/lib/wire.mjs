// 传输和握手：一行一个 JSON；质询与应答（技术设计 §5.1）。
import crypto from "node:crypto";

const MAX_LINE = 8 * 1024 * 1024; // 单行上限 8 MB（§5.1）
export const NONCE_BYTES = 32;

export function send(socket, frame) {
  if (!socket.destroyed) socket.write(`${JSON.stringify(frame)}\n`);
}

// 按行切分。任何一行不是 JSON 或超过上限就报错，由调用方断开。
export function readFrames(socket, onFrame, onBad) {
  let buf = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buf += chunk;
    if (buf.length > MAX_LINE) return onBad(new Error("line too long"));
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        return onBad(new Error("not json"));
      }
      if (frame === null || typeof frame !== "object") return onBad(new Error("not an object"));
      onFrame(frame);
    }
  });
}

const hmac = (token, ...parts) => {
  const h = crypto.createHmac("sha256", token);
  for (const p of parts) h.update(p);
  return h.digest();
};

// 两种握手算法。
// spec：§5.1 原文。客户端 proof = HMAC(token, nonce + clientNonce)，服务端 proof = HMAC(token, clientNonce)。
//       缺陷：nonce 为空时两者相等，冒充者把客户端的 proof 原样发回就能通过（README 的“抢占”一节实测）。
// v1：  两个方向加不同的固定前缀，并且两个 nonce 都必须恰好 32 字节，上面的反射就不成立了。
export function clientProof(mode, token, nonce, clientNonce) {
  if (mode === "spec") return hmac(token, nonce, clientNonce);
  return hmac(token, "runyard-handshake-1|client|", nonce, clientNonce);
}
export function serverProof(mode, token, nonce, clientNonce) {
  if (mode === "spec") return hmac(token, clientNonce);
  return hmac(token, "runyard-handshake-1|server|", nonce, clientNonce);
}

export function sameBytes(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 把 base64 文本还原成字节；v1 要求长度恰好 32 字节，spec 不检查（原文没有这条）
export function decodeNonce(mode, text) {
  if (typeof text !== "string") return null;
  const bytes = Buffer.from(text, "base64");
  if (mode !== "spec" && bytes.length !== NONCE_BYTES) return null;
  return bytes;
}

export const newNonce = () => crypto.randomBytes(NONCE_BYTES);
