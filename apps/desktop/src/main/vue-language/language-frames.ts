/** LSP 与 tsserver 输出都按 UTF-8 字节计数，不能按字符串长度切帧。 */
export class LanguageFrames {
  #buffer = Buffer.alloc(0);
  push(chunk: Buffer): Record<string, unknown>[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages: Record<string, unknown>[] = [];
    for (;;) {
      const end = this.#buffer.indexOf("\r\n\r\n");
      if (end < 0) {
        if (this.#buffer.length > 8192) throw new Error("LANGUAGE_FRAME_HEADER");
        return messages;
      }
      const header = this.#buffer.subarray(0, end).toString("ascii").trim();
      const match = /^Content-Length: (\d+)$/im.exec(header);
      const length = Number(match?.[1]);
      if (!match || !Number.isSafeInteger(length) || length > 16_777_216) {
        throw new Error("LANGUAGE_FRAME_LENGTH");
      }
      if (this.#buffer.length < end + 4 + length) return messages;
      const value: unknown = JSON.parse(
        this.#buffer.subarray(end + 4, end + 4 + length).toString("utf8"),
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("LANGUAGE_FRAME_BODY");
      messages.push(value as Record<string, unknown>);
      this.#buffer = this.#buffer.subarray(end + 4 + length);
    }
  }
}
export function languageFrame(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}
