import { describe, expect, it } from "vitest";
import { FAKE_EPOCH, FakeClock } from "./fake-clock.ts";

describe("FakeClock", () => {
  it("不推进就不触发，推进到点才触发，now 随之变化", async () => {
    const clock = new FakeClock();
    let fired = 0;
    clock.setTimeout(() => fired++, 3000);
    await clock.advance(2999);
    expect(fired).toBe(0);
    expect(clock.now()).toBe(FAKE_EPOCH + 2999);
    await clock.advance(1);
    expect(fired).toBe(1);
  });

  it("按到点顺序触发，同一时刻按设定顺序", async () => {
    const clock = new FakeClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push("b"), 20);
    clock.setTimeout(() => order.push("a"), 10);
    clock.setTimeout(() => order.push("c"), 20);
    await clock.advance(50);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("触发时的 now 是定时器的到点时间，不是推进的终点", async () => {
    const clock = new FakeClock();
    const seen: number[] = [];
    clock.setTimeout(() => seen.push(clock.now() - FAKE_EPOCH), 700);
    await clock.advance(5000);
    expect(seen).toEqual([700]);
  });

  it("回调里设的新定时器在同一次推进里也会按时触发", async () => {
    const clock = new FakeClock();
    const seen: number[] = [];
    clock.setTimeout(() => {
      seen.push(1);
      clock.setTimeout(() => seen.push(2), 100);
    }, 100);
    await clock.advance(200);
    expect(seen).toEqual([1, 2]);
  });

  it("interval 重复触发，clearInterval 之后停止", async () => {
    const clock = new FakeClock();
    let ticks = 0;
    const id = clock.setInterval(() => ticks++, 1000);
    await clock.advance(3500);
    expect(ticks).toBe(3);
    clock.clearInterval(id);
    await clock.advance(5000);
    expect(ticks).toBe(3);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("clearTimeout 取消还没到点的定时器", async () => {
    const clock = new FakeClock();
    let fired = false;
    const id = clock.setTimeout(() => {
      fired = true;
    }, 10);
    clock.clearTimeout(id);
    await clock.advance(100);
    expect(fired).toBe(false);
  });

  it("sleep 在推进之后才完成，且 await 之后的代码在下一个定时器之前跑完", async () => {
    const clock = new FakeClock();
    const log: string[] = [];
    void clock.sleep(10).then(() => log.push("slept"));
    clock.setTimeout(() => log.push("later"), 20);
    await clock.advance(30);
    expect(log).toEqual(["slept", "later"]);
  });

  it("间隔不大于 0 的 interval 直接报错，不会让推进死循环", () => {
    expect(() => new FakeClock().setInterval(() => {}, 0)).toThrow();
  });

  it("负的推进量报错", async () => {
    await expect(new FakeClock().advance(-1)).rejects.toThrow();
  });
});

describe("FakeClock 驱动规格里的时长", () => {
  it.each([
    ["停止后重新绑定的上限", 3000],
    ["优雅等待 graceMs", 2000],
    ["慢启动提示", 30_000],
    ["运行空闲", 30 * 60_000],
    ["管理进程空闲", 60_000],
  ])("%s（%i 毫秒）不用真的等", async (_name, ms) => {
    const clock = new FakeClock();
    let fired = false;
    clock.setTimeout(() => {
      fired = true;
    }, ms);
    const started = Date.now();
    await clock.advance(ms);
    expect(fired).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
