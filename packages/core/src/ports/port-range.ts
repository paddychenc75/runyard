// 分配端口的范围，含两端（规格 RUN-PORTS-01、04；设置里的 ports）。
// 默认 7100 到 7999：避开 Chromium 的禁用端口表（技术设计 §4.5）。

export type PortRange = { readonly min: number; readonly max: number };

export const DEFAULT_PORT_RANGE: PortRange = { min: 7100, max: 7999 };
