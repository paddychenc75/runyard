import { useEffect, useState } from "react";

/** 当前时间，每隔一段时间刷新一次：列表里的“2 分钟前”“剩 12 天”不靠事件，要自己走字 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
