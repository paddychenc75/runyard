// 由 pnpm i18n:build 生成，不要手改。来源：locales/zh-CN/*.json（技术设计 §6.8）

export type CatalogMessages = {
  "cli.arg.key.hint": Record<never, never>;
  "cli.arg.name.hint": Record<never, never>;
  "cli.arg.pg.hint": Record<never, never>;
  "cli.arg.pgOptional.hint": Record<never, never>;
  "cli.arg.template.hint": Record<never, never>;
  "cli.arg.templateRef.hint": Record<never, never>;
  "cli.arg.value.hint": Record<never, never>;
  "cli.command.config.title": Record<never, never>;
  "cli.command.configGet.title": Record<never, never>;
  "cli.command.configSet.title": Record<never, never>;
  "cli.command.doctor.title": Record<never, never>;
  "cli.command.logs.title": Record<never, never>;
  "cli.command.new.title": Record<never, never>;
  "cli.command.rm.title": Record<never, never>;
  "cli.command.run.title": Record<never, never>;
  "cli.command.skill.title": Record<never, never>;
  "cli.command.skillInstall.title": Record<never, never>;
  "cli.command.status.title": Record<never, never>;
  "cli.command.stop.title": Record<never, never>;
  "cli.command.template.title": Record<never, never>;
  "cli.command.templateLint.title": Record<never, never>;
  "cli.command.templateList.title": Record<never, never>;
  "cli.command.templateSave.title": Record<never, never>;
  "cli.command.templateShow.title": Record<never, never>;
  "cli.command.templateTest.title": Record<never, never>;
  "cli.config.getLang.body": {
    lang: string | number;
    source: string;
  };
  "cli.config.setLang.body": {
    lang: string | number;
  };
  "cli.doctor.bundle.body": {
    path: string | number;
  };
  "cli.doctor.cli.body": {
    kind: string;
    path: string | number;
    version: string | number;
  };
  "cli.doctor.installCommand.body": {
    command: string | number;
  };
  "cli.doctor.installUrl.body": {
    url: string | number;
  };
  "cli.doctor.library.body": {
    root: string | number;
  };
  "cli.doctor.other.body": {
    kind: string;
    path: string | number;
    version: string | number;
  };
  "cli.doctor.supervisorDown.body": {
    reason: string | number;
  };
  "cli.doctor.supervisorRunning.body": {
    runs: number;
    startedBy: string;
    version: string | number;
  };
  "cli.doctor.system.body": {
    arch: string | number;
    os: string | number;
    version: string | number;
  };
  "cli.doctor.toolFound.body": {
    path: string | number;
    tool: string | number;
    version: string | number;
  };
  "cli.doctor.toolMissing.body": {
    tool: string | number;
  };
  "cli.doctor.toolTooOld.body": {
    required: string | number;
    tool: string | number;
    version: string | number;
  };
  "cli.doctor.toolUnknown.body": {
    tool: string | number;
  };
  "cli.error.title.label": {
    title: string | number;
  };
  "cli.help.arguments.label": Record<never, never>;
  "cli.help.commands.label": Record<never, never>;
  "cli.help.globalOptions.label": Record<never, never>;
  "cli.help.moreInfo.hint": {
    example: string | number;
  };
  "cli.help.options.label": Record<never, never>;
  "cli.help.summary.title": Record<never, never>;
  "cli.help.usage.label": Record<never, never>;
  "cli.lang.unsupported.hint": {
    source: string;
    value: string | number;
  };
  "cli.new.created.body": {
    name: string | number;
    path: string | number;
  };
  "cli.new.reused.body": {
    name: string | number;
    path: string | number;
  };
  "cli.option.all.hint": Record<never, never>;
  "cli.option.as.hint": Record<never, never>;
  "cli.option.bundle.hint": Record<never, never>;
  "cli.option.cleanAfter.hint": Record<never, never>;
  "cli.option.description.hint": Record<never, never>;
  "cli.option.exclude.hint": Record<never, never>;
  "cli.option.follow.hint": Record<never, never>;
  "cli.option.help.hint": Record<never, never>;
  "cli.option.ifExists.hint": Record<never, never>;
  "cli.option.include.hint": Record<never, never>;
  "cli.option.json.hint": Record<never, never>;
  "cli.option.keepDir.hint": Record<never, never>;
  "cli.option.lang.hint": Record<never, never>;
  "cli.option.mine.hint": Record<never, never>;
  "cli.option.noWait.hint": Record<never, never>;
  "cli.option.note.hint": Record<never, never>;
  "cli.option.port.hint": Record<never, never>;
  "cli.option.quiet.hint": Record<never, never>;
  "cli.option.raw.hint": Record<never, never>;
  "cli.option.replaceName.hint": Record<never, never>;
  "cli.option.restart.hint": Record<never, never>;
  "cli.option.root.hint": Record<never, never>;
  "cli.option.run.hint": Record<never, never>;
  "cli.option.running.hint": Record<never, never>;
  "cli.option.since.hint": Record<never, never>;
  "cli.option.tail.hint": Record<never, never>;
  "cli.option.target.hint": Record<never, never>;
  "cli.option.template.hint": Record<never, never>;
  "cli.option.templateName.hint": Record<never, never>;
  "cli.option.timeout.hint": Record<never, never>;
  "cli.option.toolVersion.hint": Record<never, never>;
  "cli.option.var.hint": Record<never, never>;
  "cli.rm.trashed.body": {
    name: string | number;
    path: string | number;
  };
  "cli.run.alreadyRunning.body": {
    name: string | number;
  };
  "cli.run.finished.body": {
    exitCode: string | number;
    name: string | number;
  };
  "cli.run.ready.body": {
    name: string | number;
    url: string | number;
  };
  "cli.run.started.body": {
    name: string | number;
    runId: string | number;
  };
  "cli.run.starting.body": {
    name: string | number;
  };
  "cli.skillInstall.installed.body": {
    path: string | number;
    target: string;
  };
  "cli.status.empty.body": Record<never, never>;
  "cli.status.item.body": {
    missing: string;
    name: string | number;
    state: string | number;
    url: string;
  };
  "cli.status.summary.body": {
    count: number;
  };
  "cli.stop.none.body": Record<never, never>;
  "cli.stop.stopped.body": {
    name: string | number;
    runId: string | number;
  };
  "cli.templateLint.failed.body": {
    template: string | number;
  };
  "cli.templateLint.issue.body": {
    message: string | number;
    path: string | number;
    rule: string | number;
  };
  "cli.templateLint.ok.body": {
    template: string | number;
  };
  "cli.templateList.item.body": {
    id: string | number;
    name: string | number;
    source: string;
    valid: string;
  };
  "cli.templateSave.saved.body": {
    id: string | number;
    path: string | number;
  };
  "cli.templateShow.file.body": {
    file: string | number;
  };
  "cli.templateShow.path.body": {
    path: string | number;
  };
  "cli.usage.invalidValue.body": {
    option: string | number;
    value: string | number;
  };
  "cli.usage.missingArgument.body": {
    argument: string | number;
  };
  "cli.usage.missingCommand.body": Record<never, never>;
  "cli.usage.optionNeedsValue.body": {
    option: string | number;
  };
  "cli.usage.optionTakesNoValue.body": {
    option: string | number;
  };
  "cli.usage.stopTarget.body": Record<never, never>;
  "cli.usage.tooManyArguments.body": {
    argument: string | number;
  };
  "cli.usage.unknownCommand.body": {
    command: string | number;
  };
  "cli.usage.unknownOption.body": {
    option: string | number;
  };
  "cli.usage.unknownSetting.body": {
    name: string | number;
  };
  "desktop.create.title": Record<never, never>;
  "desktop.error.title.label": {
    title: string | number;
  };
  "desktop.preview.frame.label": Record<never, never>;
  "desktop.preview.waiting.label": Record<never, never>;
  "desktop.run.action": Record<never, never>;
  "desktop.state.idle.label": Record<never, never>;
  "desktop.stop.action": Record<never, never>;
  "desktop.window.title": Record<never, never>;
  "format.duration.days": {
    count: number;
  };
  "format.duration.hours": {
    count: number;
  };
  "format.duration.minutes": {
    count: number;
  };
  "format.duration.seconds": {
    count: number;
  };
  "format.relative.days": {
    count: number;
  };
  "format.relative.hours": {
    count: number;
  };
  "format.relative.justNow": Record<never, never>;
  "format.relative.minutes": {
    count: number;
  };
  "library.column.actions.aria": Record<never, never>;
  "library.column.creator.label": Record<never, never>;
  "library.column.lastOpened.label": Record<never, never>;
  "library.column.name.label": Record<never, never>;
  "library.column.port.label": Record<never, never>;
  "library.column.retention.label": Record<never, never>;
  "library.column.status.label": Record<never, never>;
  "library.column.template.label": Record<never, never>;
  "library.creator.agent.label": Record<never, never>;
  "library.creator.cli.label": Record<never, never>;
  "library.creator.me.label": Record<never, never>;
  "library.empty.cli.label": Record<never, never>;
  "library.empty.hint": Record<never, never>;
  "library.empty.title": Record<never, never>;
  "library.filter.agent.label": Record<never, never>;
  "library.filter.all.label": Record<never, never>;
  "library.filter.autoClean.label": Record<never, never>;
  "library.filter.kept.label": Record<never, never>;
  "library.nav.aria": Record<never, never>;
  "library.nav.library.title": Record<never, never>;
  "library.nav.manage.title": Record<never, never>;
  "library.nav.settings.label": Record<never, never>;
  "library.nav.templates.label": Record<never, never>;
  "library.nav.unused.label": Record<never, never>;
  "library.note.empty.label": Record<never, never>;
  "library.page.summary.label": {
    running: number;
    total: number;
  };
  "library.retention.autoClean.label": {
    days: number;
  };
  "library.retention.autoClean.tooltip": {
    days: number;
  };
  "library.retention.kept.label": Record<never, never>;
  "library.sidebar.footer.label": {
    count: number;
  };
  "library.tab.title": Record<never, never>;
  "library.table.aria": Record<never, never>;
  "library.topbar.idle.label": Record<never, never>;
  "library.topbar.running.label": {
    count: number;
  };
  "platform.fileManager": Record<never, never>;
  "platform.trash": Record<never, never>;
  "workspace.closeConfirm.body": Record<never, never>;
  "workspace.closeConfirm.cancel.action": Record<never, never>;
  "workspace.closeConfirm.confirm.action": Record<never, never>;
  "workspace.closeConfirm.optOut.hint": Record<never, never>;
  "workspace.closeConfirm.optOut.label": Record<never, never>;
  "workspace.closeConfirm.title": {
    name: string | number;
  };
  "workspace.tab.close.label": {
    name: string | number;
  };
  "workspace.tabs.aria": Record<never, never>;
};
