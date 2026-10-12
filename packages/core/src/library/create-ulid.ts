// 项目 id 用 ULID：48 位毫秒时间加 80 位随机数，26 个 Crockford base32 字符，按字典序就是按时间序。
// 时间和随机数都由调用方给，这里不读时钟也不碰全局随机源。

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createUlid(nowMs: number, random: Uint8Array): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= 2 ** 48)
    throw new RangeError("ulid time must be an integer in [0, 2^48)");
  if (random.length < 10) throw new RangeError("ulid needs 10 random bytes");
  let time = "";
  let rest = nowMs;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  // 80 位随机数按 5 位一组取 16 个字符
  let bits = 0;
  let buffer = 0;
  let tail = "";
  for (const byte of random.subarray(0, 10)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      tail += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return time + tail;
}

/** 生产用：随机数取自 Web Crypto（Node 和浏览器都有，不算系统差异） */
export function randomUlid(nowMs: number): string {
  return createUlid(nowMs, globalThis.crypto.getRandomValues(new Uint8Array(10)));
}
