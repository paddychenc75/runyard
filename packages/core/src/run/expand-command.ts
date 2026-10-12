// 运行器命令的占位符替换（docs/architecture/runner-format.md 第 1 节，规格 RUN-LIFECYCLE-26）。
// 命令是参数数组，不经过 shell：占位符按元素替换，替换后的值再含空格也还是同一个参数。
// 只认这四个名字；别的花括号原样保留（比如 JSON 参数）。

export type CommandVariables = {
  readonly port?: number;
  readonly entry?: string;
  readonly dir: string;
  readonly name: string;
};

const placeholder = /\{(port|entry|dir|name)\}/g;

export function expandCommand(command: readonly string[], vars: CommandVariables): string[] {
  const values: Record<string, string | undefined> = {
    port: vars.port === undefined ? undefined : String(vars.port),
    entry: vars.entry,
    dir: vars.dir,
    name: vars.name,
  };
  return command.map((element) =>
    element.replace(placeholder, (whole, key: string) => values[key] ?? whole),
  );
}
