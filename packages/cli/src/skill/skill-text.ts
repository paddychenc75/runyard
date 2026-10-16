// 写给智能体的 SKILL.md 全文（规格 CLI-COMMANDS“skill install”）。
// 这是随命令行发布的数据，不是给人看的界面文字：全文和命令示例永远是英文，不随命令行语言变，
// 所以不走文案包。要点清单在规格里，改这里先看规格；不教智能体去设置语言。
export const SKILL_TEXT = `---
name: runyard
description: Create, run and inspect small throwaway code projects (web pages, React apps, scripts) with the runyard command line. Use it when you need to try out or show a piece of code instead of starting a dev server yourself.
---

# Runyard

Runyard creates small projects from templates, runs them in the background and keeps their logs.
Always add \`--json\`: standard output is then exactly one JSON object that you can parse.

## Workflow

1. List templates when you are unsure which one fits: \`runyard template list --json\`.
2. Create and start a project in one step, and say why it exists:
   \`runyard new <template> [name] --run --note "what this is for" --json\`
   For a server the result has \`run.url\`; for a script it has the output once it exits.
3. Edit the files under the \`path\` in the result directly. A running server reloads by itself.
4. Check what happened with \`runyard logs <name> --since <cursor> --json\`.
   Use the \`cursor\` from the previous result to read only what is new.
5. Stop it when you are done: \`runyard stop <name> --json\`.

## Rules

- Do not start your own dev server for these projects. Use \`runyard run <name> --json\`.
- A project that only verifies something and is not meant to be kept: add \`--clean-after 30d\` to \`new\`
  so it is cleaned up later. If the user says to keep it, leave the option out.
- When a command fails, the JSON has \`error.code\` and \`error.hint\`. Do what \`error.hint\` says,
  do not retry the same command blindly.
- \`runyard status --json\` shows what is running. \`runyard doctor --json\` shows which tools are installed.
`;
