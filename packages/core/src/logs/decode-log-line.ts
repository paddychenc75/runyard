// 先严格 UTF-8，失败再用 GB18030（决策记录 0008）。
// ignoreBOM 必须为 true：默认的 TextDecoder 会吞掉开头的字节序标记，
// 而日志要原样保留它，读取时才去掉（规格 run/logs）。
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const gb18030 = new TextDecoder("gb18030", { ignoreBOM: true });

export function decodeLogLine(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return gb18030.decode(bytes);
  }
}
