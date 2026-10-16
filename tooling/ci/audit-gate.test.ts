import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { evaluate, renderReport } from "./audit-gate.ts";

// 每个用例要起子进程（跑脚本或 git）；Windows 机器上子进程慢，默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const TODAY = new Date("2026-10-12T08:00:00Z");
const script = join(import.meta.dirname, "audit-gate.ts");

const advisory = (extra: Record<string, unknown> = {}) => ({
  findings: [{ version: "1.2.1", paths: ["a>b>demo"], dev: false }],
  title: "示例公告",
  module_name: "demo",
  severity: "high",
  github_advisory_id: "GHSA-68fv-2mgg-jv7q",
  patched_versions: ">=1.2.2",
  ...extra,
});
const audit = (...items: Record<string, unknown>[]) => ({
  advisories: Object.fromEntries(items.map((a, i) => [String(i), a])),
});

const entry = (expires: string, pkg = "demo", scope = "root") => `
[[allow]]
id = "GHSA-68fv-2mgg-jv7q"
scope = "${scope}"
package = "${pkg}"
reason = "只在开发工具里用"
expires = ${expires}
`;
const opts = { scope: "root", includeDev: false, today: TODAY };

describe("evaluate", () => {
  it("没有公告：通过", () => {
    expect(evaluate(audit(), "# 空\n", opts).failures).toEqual([]);
  });

  it("high 且未放行：失败，信息里有编号和处理办法", () => {
    const r = evaluate(audit(advisory()), "# 空\n", opts);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("GHSA-68fv-2mgg-jv7q");
    expect(r.failures[0]).toContain("allowlist.toml");
  });

  it("critical 同样失败；moderate 和 low 不挡，moderate 会列出", () => {
    expect(evaluate(audit(advisory({ severity: "critical" })), "", opts).failures).toHaveLength(1);
    const r = evaluate(
      audit(
        advisory({ severity: "moderate" }),
        advisory({ severity: "low", github_advisory_id: "GHSA-aaaa-bbbb-cccc" }),
      ),
      "",
      opts,
    );
    expect(r.failures).toEqual([]);
    expect(r.moderate).toHaveLength(1);
  });

  it("允许清单里有未过期条目：放行", () => {
    const r = evaluate(audit(advisory()), entry("2026-10-26"), opts);
    expect(r.failures).toEqual([]);
    expect(r.waived).toHaveLength(1);
  });

  it("条目已过期：失败（即使公告已被它覆盖）", () => {
    const r = evaluate(audit(advisory()), entry("2026-10-01"), opts);
    expect(r.failures.some((f) => f.includes("已于 2026-10-01 过期"))).toBe(true);
  });

  it("条目期限超过 30 天上限：失败", () => {
    const r = evaluate(audit(advisory()), entry("2026-12-31"), opts);
    expect(r.failures.some((f) => f.includes("上限 30 天"))).toBe(true);
  });

  it("package 或 scope 对不上：不放行", () => {
    expect(evaluate(audit(advisory()), entry("2026-10-26", "other"), opts).failures).toHaveLength(
      1,
    );
    expect(
      evaluate(audit(advisory()), entry("2026-10-26", "demo", "template:x"), opts).failures,
    ).toHaveLength(1);
    expect(
      evaluate(audit(advisory()), entry("2026-10-26", "demo", "template:x"), {
        ...opts,
        scope: "template:x",
      }).failures,
    ).toEqual([]);
  });

  it("只在开发依赖里的公告：默认不统计，--include-dev 时统计", () => {
    const dev = advisory({ findings: [{ version: "1.2.1", paths: ["x"], dev: true }] });
    const normal = evaluate(audit(dev), "", opts);
    expect(normal.failures).toEqual([]);
    expect(normal.warnings[0]).toContain("只在开发依赖里");
    expect(evaluate(audit(dev), "", { ...opts, includeDev: true }).failures).toHaveLength(1);
  });

  it("同时出现在开发和正式依赖里：按正式依赖算", () => {
    const mixed = advisory({
      findings: [
        { version: "1.2.1", paths: ["x"], dev: true },
        { version: "1.2.1", paths: ["y"], dev: false },
      ],
    });
    expect(evaluate(audit(mixed), "", opts).failures).toHaveLength(1);
  });

  it("条目没有命中任何公告：提示可以删除，不失败", () => {
    const r = evaluate(audit(), entry("2026-10-26"), opts);
    expect(r.failures).toEqual([]);
    expect(r.warnings[0]).toContain("删除");
  });

  it("输出不是 audit 格式：失败", () => {
    expect(evaluate({ foo: 1 }, "", opts).failures[0]).toContain("advisories");
    expect(evaluate(null, "", opts).failures[0]).toContain("advisories");
  });

  it("报告写出结论", () => {
    expect(renderReport(evaluate(audit(advisory()), "", opts))).toContain("失败");
    expect(renderReport(evaluate(audit(), "", opts))).toContain("通过");
  });
});

describe("命令行", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));
  const run = (auditText: string, ...args: string[]) => {
    const file = join(dir, "audit.json");
    writeFileSync(file, auditText);
    const allow = join(dir, "allowlist.toml");
    writeFileSync(allow, "# 空\n");
    return spawnSync(
      process.execPath,
      [script, "--file", file, "--allowlist", allow, "--today", "2026-10-12", ...args],
      { encoding: "utf8" },
    );
  };

  it("通过、失败、空输出的退出码", () => {
    expect(run(JSON.stringify(audit())).status).toBe(0);
    expect(run(JSON.stringify(audit(advisory()))).status).toBe(1);
    expect(run("").status).toBe(1);
    expect(run("<html>502</html>").status).toBe(1);
  });

  it("--lenient：输出为空或不是 JSON 时只警告", () => {
    const r = run("", "--lenient");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("审计输出为空");
    expect(run("<html>502</html>", "--lenient").status).toBe(0);
    // 但有真实高危时 --lenient 不能放过
    expect(run(JSON.stringify(audit(advisory())), "--lenient").status).toBe(1);
  });

  it("--report 写出 Markdown；缺 --file 退出码 2", () => {
    const report = join(dir, "report.md");
    run(JSON.stringify(audit(advisory())), "--report", report);
    expect(readFileSync(report, "utf8")).toContain("审计闸门结果：失败");
    expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
