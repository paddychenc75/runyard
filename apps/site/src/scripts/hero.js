// 首屏动画：照 docs/design/site/hero-prototype.html 原样移植（规则见 hero-animation.md）。
// 整段由一个时钟按毫秒算出每一帧；减弱动态效果时停在最后一帧；舞台不在视野或标签页在后台时暂停。
const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  box = $("box"),
  cmd = $("cmd"),
  typed = $("typed"),
  caret = $("caret"),
  card = $("card");
const bar = $("bar"),
  curbg = $("curbg"),
  pv = $("pv"),
  dot = $("dot"),
  count = $("count"),
  tplBtn = $("tplBtn");
const lines = [...document.querySelectorAll("#code .ln")];
const COMMAND = "runyard new react19 --run";

// 时间轴（毫秒），一轮 7200ms；与 hero-animation.md 的表一致
const LOOP = 7200;
const K = {
  fadeIn: [0, 300],
  type: [150, 28],
  lines: [900, 75, 150],
  sweep: [1900, 250, 200],
  target: 7,
  overshoot: [3900, 500],
  pop: [4400, 250],
  pulse: [4650, 300],
  clicks: [4900, 5500, 6100],
  fadeOut: [6600, 600],
};
const LINE_H = 24,
  CODE_TOP = 64 + 40,
  BAR_FULL = 478,
  BAR_IN = 478 - 56;
// 三条缓动曲线（视觉规范第 6 节），用二分法解三次贝塞尔
const bez = (x1, y1, x2, y2) => (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0,
    hi = 1,
    t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
    if (cx < x) lo = t;
    else hi = t;
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
};
const standard = bez(0.2, 0, 0, 1),
  slide = bez(0.32, 0.72, 0, 1),
  popover = bez(0.34, 1.3, 0.64, 1);
const prog = (t, start, dur) => Math.min(1, Math.max(0, (t - start) / dur));

function render(t) {
  // 整体淡入、淡出
  const fin = standard(prog(t, K.fadeIn[0], K.fadeIn[1]));
  const fout = 1 - standard(prog(t, K.fadeOut[0], K.fadeOut[1]));
  stage.style.opacity = Math.min(fin, fout);
  const lift = (1 - fin) * 8;
  cmd.style.transform = card.style.transform = `translateY(${lift}px)`;

  // 命令逐字打出；打完后光标闪两下再消失
  const n = Math.max(0, Math.min(COMMAND.length, Math.floor((t - K.type[0]) / K.type[1])));
  typed.textContent = COMMAND.slice(0, n);
  const typedEnd = K.type[0] + COMMAND.length * K.type[1];
  caret.style.opacity =
    t < typedEnd ? 1 : t < typedEnd + 600 ? (Math.floor((t - typedEnd) / 150) % 2 ? 0 : 1) : 0;

  // 执行线：第几行，以及行内位移
  const s = t - K.sweep[0];
  const step = Math.max(0, Math.min(K.target, Math.floor(s / K.sweep[1])));
  const within =
    s < 0 ? 0 : step >= K.target ? 1 : slide(Math.min(1, (s - step * K.sweep[1]) / K.sweep[2]));
  const from = Math.max(0, step - 1),
    pos = s < 0 ? 0 : step === 0 ? 0 : from + (step - from) * within;
  const execIdx = s < 0 ? -1 : step;

  // 代码行逐行出现；执行线走过的行变实，没走到的偏淡（0.38）
  lines.forEach((el, i) => {
    const a = standard(prog(t, K.lines[0] + i * K.lines[1], K.lines[2]));
    el.style.opacity = a * (i <= execIdx ? 1 : 0.38);
    el.style.transform = `translateY(${(1 - a) * 4}px)`;
  });
  curbg.style.opacity = s < 0 ? 0 : Math.min(1, s / 120);
  curbg.style.transform = `translateY(${pos * LINE_H}px)`;

  // 线的位置与长度：先在卡片里，再冲出右边缘
  const ov = standard(prog(t, K.overshoot[0], K.overshoot[1]));
  bar.style.opacity = s < 0 ? 0 : Math.min(1, s / 120);
  bar.style.transform = `translateY(${CODE_TOP + pos * LINE_H + LINE_H - 3}px) scaleX(${(BAR_IN + (BAR_FULL - BAR_IN) * ov) / BAR_FULL})`;

  // 预览卡滑入（浮层缓动，带轻微回弹）
  const p = prog(t, K.pop[0], K.pop[1]);
  pv.style.opacity = standard(p);
  pv.style.transform = `translateX(${(1 - popover(p)) * 24}px)`;
  const pu = prog(t, K.pulse[0], K.pulse[1]);
  dot.style.transform = `scale(${1 + 0.4 * Math.sin(Math.PI * pu)})`;

  // 预览里的计数器被点三次
  const clicks = K.clicks.filter((c) => t >= c).length;
  count.textContent = String(clicks);
  const pressed = K.clicks.some((c) => t >= c - 90 && t < c + 30);
  tplBtn.style.transform = pressed ? "scale(0.96)" : "none";
}

// 窄屏：舞台按可用宽度缩放
function fit() {
  const w = Math.min(560, box.parentElement.clientWidth);
  const k = w / 560;
  stage.style.transform = `scale(${k})`;
  box.style.width = `${w}px`;
  box.style.height = `${520 * k}px`;
}
addEventListener("resize", fit);
fit();

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const FINAL = K.clicks[2] + 200; // 最后一帧：线冲出边缘、预览卡已在、点过三次
let clock = 0,
  last = null,
  visible = true,
  raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (last !== null) clock = (clock + Math.min(64, now - last)) % LOOP; // 切回标签页不跳帧
  last = now;
  render(clock);
}
function start() {
  cancelAnimationFrame(raf);
  if (reduce.matches) {
    render(FINAL);
    return;
  }
  if (!visible || document.hidden) {
    last = null;
    return;
  }
  raf = requestAnimationFrame(frame);
}
// 给录屏和检查用：?t=毫秒 固定在某一帧
const q = new URLSearchParams(location.search);
if (q.has("t")) {
  render(Number(q.get("t")));
} else {
  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    start();
  }).observe(box);
  document.addEventListener("visibilitychange", start);
  reduce.addEventListener("change", start);
  render(reduce.matches ? FINAL : 0);
  start();
}
