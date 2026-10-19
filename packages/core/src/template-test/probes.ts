import { request } from "node:http";
import type { Runner } from "@runyard/protocol";
import { libraryError } from "../library/library-error.ts";
import type { RunClock } from "../run/run-clock.ts";

export async function until(
  clock: RunClock,
  name: string,
  probe: () => Promise<boolean>,
  ms = 30000,
  signal?: AbortSignal,
): Promise<void> {
  const end = clock.now() + ms;
  while (clock.now() < end) {
    if (signal?.aborted) throw new Error("template test cancelled");
    if (await probe()) return;
    await new Promise<void>((resolve) => clock.setTimeout(resolve, 100));
  }
  throw new Error(`probe did not change: ${name}`);
}
export function pageText(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, timeout: 2000 }, (res) => {
      let text = "";
      res.on("data", (chunk) => {
        if (text.length < 5 * 1024 * 1024) text += String(chunk);
      });
      res.on("end", () =>
        res.statusCode !== undefined && res.statusCode < 400
          ? resolve(text)
          : reject(new Error(`HTTP ${res.statusCode}`)),
      );
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}
export async function bounded<T>(
  clock: RunClock,
  name: string,
  work: Promise<T>,
  ms = 60000,
  signal?: AbortSignal,
): Promise<T> {
  let timer: number | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        cancel = () => reject(new Error("template test cancelled"));
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
        timer = clock.setTimeout(
          () =>
            reject(
              libraryError(
                "READY_TIMEOUT",
                { name, seconds: ms / 1000 },
                "template test timed out",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}

/** 只改自己展开出的副本；在可观察位置插入唯一标记，无法构造可靠探针时失败而不假报通过。 */
export function changedEntry(
  entry: string,
  source: string,
  marker: string,
  oneshot: boolean,
): string {
  if (/\.html?$/i.test(entry)) return `${source}\n<span>${marker}</span>\n`;
  if (/\.py$/i.test(entry)) return `${source}\nprint(${JSON.stringify(marker)})\n`;
  if (/\.go$/i.test(entry)) {
    const changed = source.replace(
      /func\s+main\s*\(\s*\)\s*\{/,
      (match) => `${match}\nprintln(${JSON.stringify(marker)})`,
    );
    if (changed === source) throw new Error("no main function for reload probe");
    return changed;
  }
  if (oneshot) return `${source}\nconsole.log(${JSON.stringify(marker)});\n`;
  if (/\.vue$/i.test(entry))
    return source.replace(/<template(?:\s[^>]*)?>/, (match) => `${match}<span>${marker}</span>`);
  if (/\.[jt]sx$/i.test(entry)) {
    const changed = source.replace(
      /<(h[1-6]|p|button|div)(\s[^<>]*?)?>/,
      (match) => `${match}${marker}`,
    );
    if (changed === source) throw new Error("no rendered element for reload probe");
    return changed;
  }
  const changed = source.replace(/(["'`])Hello[^"'`]*\1/, JSON.stringify(marker));
  if (changed === source) throw new Error("no observable response literal for reload probe");
  return changed;
}

export function previewPath(runner: Runner | undefined): string {
  if (runner?.preview.path !== undefined) return runner.preview.path;
  return runner?.ready && "http" in runner.ready ? runner.ready.http.path : "/";
}
export function parseTemplateInput(text: string | null, template: string): unknown {
  try {
    return JSON.parse(text ?? "null");
  } catch {
    throw libraryError("TEMPLATE_INVALID", { template }, "invalid template or runner JSON");
  }
}
