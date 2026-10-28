import type { Page } from "@playwright/test";

export async function armTerminalProbe(page: Page, project: string) {
  await page.evaluate((project) => {
    const state = window as unknown as {
      runyard: {
        on(name: string, listener: (event: { project: string; data: string }) => void): () => void;
      };
      terminalPerformance: {
        last: number;
        receivedLines: number;
        receivedBytes: number;
        maxFrameGap: number;
        longTasks: number[];
        stop(): void;
      };
    };
    let carry = "";
    let frame = performance.now();
    let animation = 0;
    const record = {
      last: 0,
      receivedLines: 0,
      receivedBytes: 0,
      maxFrameGap: 0,
      longTasks: [] as number[],
      stop: () => {},
    };
    const stop = state.runyard.on("terminal.data", (event) => {
      if (event.project !== project) return;
      record.receivedBytes += new TextEncoder().encode(event.data).byteLength;
      const lines = (carry + event.data).split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^PERF_LINE:(\d+):/.exec(line);
        if (match) {
          record.last = Number(match[1]);
          record.receivedLines++;
        }
      }
    });
    const tasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) record.longTasks.push(entry.duration);
    });
    tasks.observe({ type: "longtask" });
    const tick = (now: number) => {
      record.maxFrameGap = Math.max(record.maxFrameGap, now - frame);
      frame = now;
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    record.stop = () => {
      stop();
      tasks.disconnect();
      cancelAnimationFrame(animation);
    };
    state.terminalPerformance = record;
  }, project);
}

export async function terminalProgress(page: Page) {
  return page.evaluate(
    () => (window as unknown as { terminalPerformance: { last: number } }).terminalPerformance.last,
  );
}

export async function finishTerminalProbe(page: Page) {
  return page.evaluate(() => {
    const record = (
      window as unknown as {
        terminalPerformance: {
          last: number;
          receivedLines: number;
          receivedBytes: number;
          maxFrameGap: number;
          longTasks: number[];
          stop(): void;
        };
      }
    ).terminalPerformance;
    record.stop();
    const { stop: _stop, ...result } = record;
    return {
      ...result,
      visibleRows: document.querySelectorAll(".xterm-rows > div").length,
      visibleTail: document.querySelector(".xterm-rows")?.textContent,
    };
  });
}
