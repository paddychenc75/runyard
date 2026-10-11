import { cpSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const FIXTURES = path.join(HERE, "fixtures");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function copyFixture(name, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(FIXTURES, name), dest, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.next`) });
}

export function rmrf(p) {
  rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** 动态取空闲端口（只在 127.0.0.1 上试绑），不假设任何端口空闲。 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function get(url, timeoutMs = 60000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await r.arrayBuffer();
    return r.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}
