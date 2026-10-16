import {
  type CommandRegistry,
  type CommandSpec,
  defineCommand,
  type OptionSpec,
  type PositionalSpec,
} from "./command-spec.ts";
import { configGet, configSet } from "./config-commands.ts";

// 命令表（docs/architecture/cli-contract.md 第 2 节）。除 config get / set 外都只有声明，没有 run：
// 实现分别在 #46（new、run、stop、status、logs、rm）、#47（doctor）、#48 和 #49（template、skill）。
// template、skill 子命令的位置参数契约没写，按“show / lint / test 收一个模板，save 收一个项目”声明，
// 实现它们的 issue 以规格为准改这里。

const pg = (required = true): PositionalSpec => ({
  name: "pg",
  required,
  hint: required ? (t) => t("cli.arg.pg.hint") : (t) => t("cli.arg.pgOptional.hint"),
});
const template: PositionalSpec = {
  name: "template",
  required: true,
  hint: (t) => t("cli.arg.template.hint"),
};
const templateRef: PositionalSpec = {
  name: "template",
  required: true,
  hint: (t) => t("cli.arg.templateRef.hint"),
};

const timeout: OptionSpec = {
  name: "timeout",
  type: "string",
  valueName: "seconds",
  hint: (t) => t("cli.option.timeout.hint"),
};
const noWait: OptionSpec = {
  name: "no-wait",
  type: "boolean",
  hint: (t) => t("cli.option.noWait.hint"),
};

const newCommand = defineCommand({
  name: "new",
  title: (t) => t("cli.command.new.title"),
  positionals: [template, { name: "name", required: false, hint: (t) => t("cli.arg.name.hint") }],
  options: [
    { name: "run", type: "boolean", hint: (t) => t("cli.option.run.hint") },
    { name: "note", type: "string", valueName: "text", hint: (t) => t("cli.option.note.hint") },
    {
      name: "clean-after",
      type: "string",
      valueName: "Nd",
      hint: (t) => t("cli.option.cleanAfter.hint"),
    },
    {
      name: "var",
      type: "string",
      multiple: true,
      valueName: "k=v",
      hint: (t) => t("cli.option.var.hint"),
    },
    {
      name: "if-exists",
      type: "string",
      valueName: "reuse|fail",
      hint: (t) => t("cli.option.ifExists.hint"),
    },
    timeout,
    noWait,
  ],
  needsSupervisor: true,
});

const runCommand = defineCommand({
  name: "run",
  title: (t) => t("cli.command.run.title"),
  positionals: [pg()],
  options: [
    timeout,
    noWait,
    { name: "restart", type: "boolean", hint: (t) => t("cli.option.restart.hint") },
    { name: "port", type: "string", valueName: "n", hint: (t) => t("cli.option.port.hint") },
  ],
  needsSupervisor: true,
});

const stopCommand = defineCommand({
  name: "stop",
  title: (t) => t("cli.command.stop.title"),
  positionals: [pg(false)],
  options: [
    { name: "all", type: "boolean", hint: (t) => t("cli.option.all.hint") },
    { name: "mine", type: "boolean", hint: (t) => t("cli.option.mine.hint") },
  ],
  needsSupervisor: true,
});

const statusCommand = defineCommand({
  name: "status",
  title: (t) => t("cli.command.status.title"),
  positionals: [pg(false)],
  options: [{ name: "running", type: "boolean", hint: (t) => t("cli.option.running.hint") }],
  needsSupervisor: true,
});

const logsCommand = defineCommand({
  name: "logs",
  title: (t) => t("cli.command.logs.title"),
  positionals: [pg()],
  options: [
    { name: "since", type: "string", valueName: "cursor", hint: (t) => t("cli.option.since.hint") },
    { name: "tail", type: "string", valueName: "n", hint: (t) => t("cli.option.tail.hint") },
    { name: "follow", type: "boolean", hint: (t) => t("cli.option.follow.hint") },
    { name: "raw", type: "boolean", hint: (t) => t("cli.option.raw.hint") },
  ],
  needsSupervisor: true,
});

const rmCommand = defineCommand({
  name: "rm",
  title: (t) => t("cli.command.rm.title"),
  positionals: [pg()],
  options: [],
  needsSupervisor: true,
});

const doctorCommand = defineCommand({
  name: "doctor",
  title: (t) => t("cli.command.doctor.title"),
  positionals: [],
  options: [
    {
      name: "template",
      type: "string",
      valueName: "id",
      hint: (t) => t("cli.option.template.hint"),
    },
    { name: "bundle", type: "boolean", hint: (t) => t("cli.option.bundle.hint") },
  ],
  needsSupervisor: true,
});

const templateCommands = [
  defineCommand({
    name: "template list",
    title: (t) => t("cli.command.templateList.title"),
    positionals: [],
    options: [],
    needsSupervisor: true,
  }),
  defineCommand({
    name: "template show",
    title: (t) => t("cli.command.templateShow.title"),
    positionals: [template],
    options: [],
    needsSupervisor: true,
  }),
  defineCommand({
    name: "template save",
    title: (t) => t("cli.command.templateSave.title"),
    positionals: [pg()],
    options: [],
    needsSupervisor: true,
  }),
  // lint 和 test 在命令行进程里直接跑，不经管理进程（规格 CLI-COMMANDS-72）
  defineCommand({
    name: "template lint",
    title: (t) => t("cli.command.templateLint.title"),
    positionals: [templateRef],
    options: [],
    needsSupervisor: false,
  }),
  defineCommand({
    name: "template test",
    title: (t) => t("cli.command.templateTest.title"),
    positionals: [templateRef],
    options: [
      { name: "keep-dir", type: "boolean", hint: (t) => t("cli.option.keepDir.hint") },
      {
        name: "tool-version",
        type: "string",
        valueName: "version",
        hint: (t) => t("cli.option.toolVersion.hint"),
      },
    ],
    needsSupervisor: false,
  }),
];

const skillInstall = defineCommand({
  name: "skill install",
  title: (t) => t("cli.command.skillInstall.title"),
  positionals: [],
  options: [
    {
      name: "target",
      type: "string",
      valueName: "claude|agents|all",
      hint: (t) => t("cli.option.target.hint"),
    },
  ],
  needsSupervisor: false,
});

const configCommands: CommandSpec[] = [
  defineCommand({
    name: "config get",
    title: (t) => t("cli.command.configGet.title"),
    positionals: [{ name: "key", required: true, hint: (t) => t("cli.arg.key.hint") }],
    options: [],
    needsSupervisor: false,
    run: configGet,
  }),
  defineCommand({
    name: "config set",
    title: (t) => t("cli.command.configSet.title"),
    positionals: [
      { name: "key", required: true, hint: (t) => t("cli.arg.key.hint") },
      { name: "value", required: true, hint: (t) => t("cli.arg.value.hint") },
    ],
    options: [],
    needsSupervisor: false,
    run: configSet,
  }),
];

export const builtinRegistry: CommandRegistry = {
  commands: [
    newCommand,
    runCommand,
    stopCommand,
    statusCommand,
    logsCommand,
    rmCommand,
    doctorCommand,
    ...templateCommands,
    skillInstall,
    ...configCommands,
  ],
  groups: [
    { name: "template", title: (t) => t("cli.command.template.title") },
    { name: "skill", title: (t) => t("cli.command.skill.title") },
    { name: "config", title: (t) => t("cli.command.config.title") },
  ],
};
