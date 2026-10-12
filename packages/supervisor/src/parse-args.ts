import { clientKindSchema, supervisorHosts } from "@runyard/protocol";

// 管理进程的配置只走命令行参数，不读环境变量（规格 SUPERVISOR-LIFECYCLE 的“启动参数只走命令行参数”）。
export interface SupervisorArgs {
  home: string;
  profile: "dev" | undefined;
  version: string;
  build: string;
  startedBy: "app" | "cli";
  host: (typeof supervisorHosts)[number];
}

export type ParsedArgs = { ok: true; args: SupervisorArgs } | { ok: false; problem: string };

export function parseSupervisorArgs(
  argv: readonly string[],
  defaultHost: SupervisorArgs["host"],
): ParsedArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      return { ok: false, problem: `malformed argument near ${String(flag)}` };
    }
    values.set(flag.slice(2), value);
  }
  const required = (name: string): string | undefined => values.get(name);
  const home = required("home");
  const version = required("version");
  const build = required("build");
  if (home === undefined || version === undefined || build === undefined) {
    return { ok: false, problem: "--home, --version and --build are required" };
  }
  const startedBy = clientKindSchema.safeParse(values.get("started-by") ?? "cli");
  const host = supervisorHosts.find(
    (candidate) => candidate === (values.get("host") ?? defaultHost),
  );
  const profile = values.get("profile");
  if (!startedBy.success || host === undefined || (profile !== undefined && profile !== "dev")) {
    return { ok: false, problem: "invalid --started-by, --host or --profile" };
  }
  return {
    ok: true,
    args: {
      home,
      profile: profile === "dev" ? "dev" : undefined,
      version,
      build,
      startedBy: startedBy.data,
      host,
    },
  };
}
