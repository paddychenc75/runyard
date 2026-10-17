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
  "cli.command.version.title": Record<never, never>;
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
    startFailure: string;
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
  "cli.option.version.hint": Record<never, never>;
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
  "cli.version.body": {
    version: string | number;
  };
  "desktop.agentNotice.meta.label": {
    time: string | number;
    url: string | number;
  };
  "desktop.agentNotice.title.label": {
    agent: string | number;
    name: string | number;
    user: (chunks: string[]) => string;
  };
  "desktop.category.frontend.label": Record<never, never>;
  "desktop.category.fullstack.label": Record<never, never>;
  "desktop.category.mine.label": Record<never, never>;
  "desktop.category.page.label": Record<never, never>;
  "desktop.category.script.label": Record<never, never>;
  "desktop.category.service.label": Record<never, never>;
  "desktop.command.autoClean.label": Record<never, never>;
  "desktop.command.closeTab.label": Record<never, never>;
  "desktop.command.copyLink.label": Record<never, never>;
  "desktop.command.copyPath.label": Record<never, never>;
  "desktop.command.devtools.label": Record<never, never>;
  "desktop.command.duplicate.label": Record<never, never>;
  "desktop.command.editNote.label": Record<never, never>;
  "desktop.command.find.label": Record<never, never>;
  "desktop.command.foldAll.label": Record<never, never>;
  "desktop.command.goToDefinition.label": Record<never, never>;
  "desktop.command.goToLine.label": Record<never, never>;
  "desktop.command.new.label": Record<never, never>;
  "desktop.command.openInBrowser.label": Record<never, never>;
  "desktop.command.openInEditor.label": Record<never, never>;
  "desktop.command.openLibrary.label": Record<never, never>;
  "desktop.command.openRunning.label": Record<never, never>;
  "desktop.command.openTerminal.label": Record<never, never>;
  "desktop.command.quickOpen.label": Record<never, never>;
  "desktop.command.reloadPreview.label": Record<never, never>;
  "desktop.command.rename.label": Record<never, never>;
  "desktop.command.renameSymbol.label": Record<never, never>;
  "desktop.command.replace.label": Record<never, never>;
  "desktop.command.restart.label": Record<never, never>;
  "desktop.command.reveal.label": Record<never, never>;
  "desktop.command.run.label": Record<never, never>;
  "desktop.command.save.label": Record<never, never>;
  "desktop.command.saveAsTemplate.label": Record<never, never>;
  "desktop.command.selectAllOccurrences.label": Record<never, never>;
  "desktop.command.settings.label": Record<never, never>;
  "desktop.command.showOutput.label": Record<never, never>;
  "desktop.command.showTerminal.label": Record<never, never>;
  "desktop.command.stop.label": Record<never, never>;
  "desktop.command.stopAll.label": Record<never, never>;
  "desktop.command.themeDark.label": Record<never, never>;
  "desktop.command.themeLight.label": Record<never, never>;
  "desktop.command.themeSystem.label": Record<never, never>;
  "desktop.command.toggleComment.label": Record<never, never>;
  "desktop.command.toggleTree.label": Record<never, never>;
  "desktop.command.trash.label": Record<never, never>;
  "desktop.command.unfoldAll.label": Record<never, never>;
  "desktop.console.clear.action": Record<never, never>;
  "desktop.console.tab.label": Record<never, never>;
  "desktop.console.tabs.aria": Record<never, never>;
  "desktop.console.terminal.label": Record<never, never>;
  "desktop.crashed.log.label": Record<never, never>;
  "desktop.crashed.overlay.aria": Record<never, never>;
  "desktop.crashed.title": {
    exitCode: string | number;
  };
  "desktop.create.autoClean.label": Record<never, never>;
  "desktop.create.autoCleanOff.hint": Record<never, never>;
  "desktop.create.autoCleanOff.label": Record<never, never>;
  "desktop.create.autoCleanOn.hint": Record<never, never>;
  "desktop.create.cancel.action": Record<never, never>;
  "desktop.create.changeTemplate.action": Record<never, never>;
  "desktop.create.cleanAfter.label": Record<never, never>;
  "desktop.create.cleanSummary.hint": {
    days: number;
  };
  "desktop.create.custom.label": Record<never, never>;
  "desktop.create.customDays.label": Record<never, never>;
  "desktop.create.customDaysInvalid.hint": Record<never, never>;
  "desktop.create.days.label": {
    days: number;
  };
  "desktop.create.dialog.title": Record<never, never>;
  "desktop.create.enter.hint": Record<never, never>;
  "desktop.create.folder.hint": {
    code: (chunks: string[]) => string;
    path: string | number;
  };
  "desktop.create.name.label": Record<never, never>;
  "desktop.create.nameInvalid.hint": Record<never, never>;
  "desktop.create.nameTaken.hint": Record<never, never>;
  "desktop.create.newProject.action": Record<never, never>;
  "desktop.create.note.label": Record<never, never>;
  "desktop.create.note.placeholder": Record<never, never>;
  "desktop.create.optional.label": Record<never, never>;
  "desktop.create.submit.action": Record<never, never>;
  "desktop.create.synced.hint": Record<never, never>;
  "desktop.create.template.label": {
    name: string | number;
  };
  "desktop.create.title": Record<never, never>;
  "desktop.duration.seconds.label": {
    seconds: string | number;
  };
  "desktop.editor.binary.body": {
    name: string | number;
    size: string | number;
  };
  "desktop.editor.binary.title": Record<never, never>;
  "desktop.editor.breadcrumb.aria": Record<never, never>;
  "desktop.editor.closeCancel.action": Record<never, never>;
  "desktop.editor.closeDiscard.action": Record<never, never>;
  "desktop.editor.closePrompt.body": Record<never, never>;
  "desktop.editor.closePrompt.title": {
    name: string | number;
  };
  "desktop.editor.closeSave.action": Record<never, never>;
  "desktop.editor.deletedNotice.body": {
    keys: string | number;
    name: string | number;
  };
  "desktop.editor.diskChanged.body": {
    name: string | number;
  };
  "desktop.editor.empty.body": Record<never, never>;
  "desktop.editor.empty.title": Record<never, never>;
  "desktop.editor.failed.body": {
    name: string | number;
  };
  "desktop.editor.failed.title": Record<never, never>;
  "desktop.editor.keepMine.action": Record<never, never>;
  "desktop.editor.loading.label": Record<never, never>;
  "desktop.editor.mixedEolNotice.body": {
    eol: string | number;
  };
  "desktop.editor.openExternal.action": Record<never, never>;
  "desktop.editor.plainLargeNotice.body": Record<never, never>;
  "desktop.editor.plainNotice.body": Record<never, never>;
  "desktop.editor.reveal.action": Record<never, never>;
  "desktop.editor.saveFailed.title": Record<never, never>;
  "desktop.editor.saveFailedOther.body": {
    name: string | number;
  };
  "desktop.editor.saveFailedPermission.body": {
    name: string | number;
  };
  "desktop.editor.saveFailedReadOnly.body": {
    name: string | number;
  };
  "desktop.editor.saveFailedRetry.action": Record<never, never>;
  "desktop.editor.statusConflict.label": Record<never, never>;
  "desktop.editor.statusDeleted.label": Record<never, never>;
  "desktop.editor.statusFailed.label": Record<never, never>;
  "desktop.editor.statusSaved.label": Record<never, never>;
  "desktop.editor.statusSaving.label": Record<never, never>;
  "desktop.editor.statusUnsaved.label": Record<never, never>;
  "desktop.editor.tabClose.label": {
    name: string | number;
  };
  "desktop.editor.tabDeleted.label": {
    name: string | number;
  };
  "desktop.editor.tabDeletedMark.label": Record<never, never>;
  "desktop.editor.tabUnsaved.label": {
    name: string | number;
  };
  "desktop.editor.tabs.aria": Record<never, never>;
  "desktop.editor.tooLarge.body": {
    limit: string | number;
    name: string | number;
    size: string | number;
  };
  "desktop.editor.tooLarge.title": Record<never, never>;
  "desktop.editor.useDisk.action": Record<never, never>;
  "desktop.empty.templates.hint": Record<never, never>;
  "desktop.error.title.label": {
    title: string | number;
  };
  "desktop.failure.log.label": Record<never, never>;
  "desktop.failure.retry.action": Record<never, never>;
  "desktop.failure.stepCopy.label": Record<never, never>;
  "desktop.failure.stepInstall.label": Record<never, never>;
  "desktop.failure.stepReady.label": Record<never, never>;
  "desktop.failure.stepStart.label": Record<never, never>;
  "desktop.failure.steps.aria": Record<never, never>;
  "desktop.linkNotice.linkInvalid.label": Record<never, never>;
  "desktop.linkNotice.newBusy.label": Record<never, never>;
  "desktop.linkNotice.newFailed.label": {
    user: (chunks: string[]) => string;
    value: string | number;
  };
  "desktop.linkNotice.newNameInvalid.label": {
    user: (chunks: string[]) => string;
    value: string | number;
  };
  "desktop.linkNotice.newNameTaken.label": {
    user: (chunks: string[]) => string;
    value: string | number;
  };
  "desktop.linkNotice.newNoTemplate.label": {
    user: (chunks: string[]) => string;
    value: string | number;
  };
  "desktop.linkNotice.newThrottled.label": Record<never, never>;
  "desktop.linkNotice.openInvalid.label": Record<never, never>;
  "desktop.linkNotice.openMissing.label": {
    user: (chunks: string[]) => string;
    value: string | number;
  };
  "desktop.menu.new.label": Record<never, never>;
  "desktop.menu.palette.label": Record<never, never>;
  "desktop.menu.quickOpen.label": Record<never, never>;
  "desktop.menu.sidebar.label": Record<never, never>;
  "desktop.missing.command.label": Record<never, never>;
  "desktop.missing.copied.label": Record<never, never>;
  "desktop.missing.copy.action": Record<never, never>;
  "desktop.missing.current.label": Record<never, never>;
  "desktop.missing.need.label": Record<never, never>;
  "desktop.missing.notInstalled.label": Record<never, never>;
  "desktop.missing.promise.label": Record<never, never>;
  "desktop.missing.recheck.action": Record<never, never>;
  "desktop.missing.requirement.label": {
    required: string | number;
    tool: string | number;
  };
  "desktop.missing.site.label": Record<never, never>;
  "desktop.notice.dismiss.aria": Record<never, never>;
  "desktop.notice.region.aria": Record<never, never>;
  "desktop.output.aria": Record<never, never>;
  "desktop.output.empty.label": Record<never, never>;
  "desktop.output.view.action": Record<never, never>;
  "desktop.palette.commands.aria": Record<never, never>;
  "desktop.palette.commandsEmpty.label": Record<never, never>;
  "desktop.palette.commandsHint.label": Record<never, never>;
  "desktop.palette.commandsPlaceholder.label": Record<never, never>;
  "desktop.palette.enterKey.label": Record<never, never>;
  "desktop.palette.escape.label": Record<never, never>;
  "desktop.palette.execute.label": Record<never, never>;
  "desktop.palette.files.aria": Record<never, never>;
  "desktop.palette.filesEmpty.label": Record<never, never>;
  "desktop.palette.filesHint.label": Record<never, never>;
  "desktop.palette.filesPlaceholder.label": Record<never, never>;
  "desktop.palette.groupApp.label": Record<never, never>;
  "desktop.palette.groupEditor.label": Record<never, never>;
  "desktop.palette.groupProject.label": Record<never, never>;
  "desktop.palette.groupRecentCommands.label": Record<never, never>;
  "desktop.palette.groupRecentFiles.label": Record<never, never>;
  "desktop.palette.move.label": Record<never, never>;
  "desktop.palette.moveKeys.label": Record<never, never>;
  "desktop.palette.open.label": Record<never, never>;
  "desktop.palette.results.aria": Record<never, never>;
  "desktop.pathNotice.title.label": {
    name: string | number;
    user: (chunks: string[]) => string;
  };
  "desktop.picker.arrowsKey.label": Record<never, never>;
  "desktop.picker.choose.action": Record<never, never>;
  "desktop.picker.dialog.aria": Record<never, never>;
  "desktop.picker.empty.hint": Record<never, never>;
  "desktop.picker.enterKey.label": Record<never, never>;
  "desktop.picker.escKey.label": Record<never, never>;
  "desktop.picker.list.aria": Record<never, never>;
  "desktop.picker.move.hint": Record<never, never>;
  "desktop.picker.next.hint": Record<never, never>;
  "desktop.picker.noMatch.hint": Record<never, never>;
  "desktop.picker.recent.label": Record<never, never>;
  "desktop.picker.search.label": Record<never, never>;
  "desktop.picker.search.placeholder": Record<never, never>;
  "desktop.port.body.label": {
    actual: string | number;
  };
  "desktop.port.dismiss.action": Record<never, never>;
  "desktop.port.occupant.label": {
    name: string | number;
    pid: string | number;
  };
  "desktop.port.title": {
    reason: string;
    wanted: string | number;
  };
  "desktop.port.untouched.label": Record<never, never>;
  "desktop.preview.devtools.action": Record<never, never>;
  "desktop.preview.frame.label": Record<never, never>;
  "desktop.preview.openExternal.action": Record<never, never>;
  "desktop.preview.reload.action": Record<never, never>;
  "desktop.preview.waiting.label": Record<never, never>;
  "desktop.quitConfirm.body": Record<never, never>;
  "desktop.quitConfirm.cancel.action": Record<never, never>;
  "desktop.quitConfirm.confirm.action": Record<never, never>;
  "desktop.quitConfirm.item.label": {
    command: string | number;
    project: string | number;
  };
  "desktop.quitConfirm.title": Record<never, never>;
  "desktop.request.aria": Record<never, never>;
  "desktop.request.autoResend.label": Record<never, never>;
  "desktop.request.autoResent.label": {
    time: string | number;
  };
  "desktop.request.bodyEmpty.label": Record<never, never>;
  "desktop.request.copied.label": Record<never, never>;
  "desktop.request.copyCurl.action": Record<never, never>;
  "desktop.request.disconnected.label": Record<never, never>;
  "desktop.request.empty.label": Record<never, never>;
  "desktop.request.headers.label": Record<never, never>;
  "desktop.request.headers.placeholder": Record<never, never>;
  "desktop.request.invalid.label": Record<never, never>;
  "desktop.request.meta.label": {
    duration: string | number;
    size: string | number;
  };
  "desktop.request.method.aria": Record<never, never>;
  "desktop.request.methodOption.label": {
    method: string | number;
  };
  "desktop.request.notReady.label": Record<never, never>;
  "desktop.request.openInBrowser.action": Record<never, never>;
  "desktop.request.path.aria": Record<never, never>;
  "desktop.request.payload.label": Record<never, never>;
  "desktop.request.payload.placeholder": Record<never, never>;
  "desktop.request.pending.label": Record<never, never>;
  "desktop.request.response.title": Record<never, never>;
  "desktop.request.responseBody.label": Record<never, never>;
  "desktop.request.responseHeaders.label": Record<never, never>;
  "desktop.request.responseTabs.aria": Record<never, never>;
  "desktop.request.send.action": Record<never, never>;
  "desktop.request.starting.hint": Record<never, never>;
  "desktop.request.stopped.hint": Record<never, never>;
  "desktop.request.tabs.aria": Record<never, never>;
  "desktop.request.timeout.label": Record<never, never>;
  "desktop.request.tooLarge.label": Record<never, never>;
  "desktop.request.unreachable.label": Record<never, never>;
  "desktop.rerun.action": Record<never, never>;
  "desktop.restart.action": Record<never, never>;
  "desktop.run.action": Record<never, never>;
  "desktop.runbar.aria": Record<never, never>;
  "desktop.runbar.cliHint.label": Record<never, never>;
  "desktop.runbar.closeHint.label": Record<never, never>;
  "desktop.runbar.missing.label": {
    tool: string | number;
  };
  "desktop.runbar.note.label": {
    hint: string | number;
    template: string | number;
  };
  "desktop.runbar.state.label": {
    port: string | number;
    state: string | number;
  };
  "desktop.runbar.tooOld.label": {
    tool: string | number;
  };
  "desktop.saveTemplate.cancel.action": Record<never, never>;
  "desktop.saveTemplate.description.label": Record<never, never>;
  "desktop.saveTemplate.description.placeholder": Record<never, never>;
  "desktop.saveTemplate.excluded.label": Record<never, never>;
  "desktop.saveTemplate.files.aria": Record<never, never>;
  "desktop.saveTemplate.files.label": Record<never, never>;
  "desktop.saveTemplate.footer.hint": {
    path: string | number;
  };
  "desktop.saveTemplate.id.hint": {
    code: (chunks: string[]) => string;
    id: string | number;
  };
  "desktop.saveTemplate.id.label": Record<never, never>;
  "desktop.saveTemplate.idInvalid.hint": Record<never, never>;
  "desktop.saveTemplate.idPlaceholder.label": Record<never, never>;
  "desktop.saveTemplate.idTaken.hint": Record<never, never>;
  "desktop.saveTemplate.listComma.label": Record<never, never>;
  "desktop.saveTemplate.name.label": Record<never, never>;
  "desktop.saveTemplate.reasonBuild.label": Record<never, never>;
  "desktop.saveTemplate.reasonDeps.label": Record<never, never>;
  "desktop.saveTemplate.reasonSecret.label": Record<never, never>;
  "desktop.saveTemplate.replaceName.label": Record<never, never>;
  "desktop.saveTemplate.requires.label": Record<never, never>;
  "desktop.saveTemplate.requiresFrom.body": {
    template: string | number;
  };
  "desktop.saveTemplate.submit.action": Record<never, never>;
  "desktop.saveTemplate.subtitle.body": {
    name: string | number;
  };
  "desktop.saveTemplate.title": Record<never, never>;
  "desktop.script.autoRun.label": Record<never, never>;
  "desktop.script.autoRunGlobalOff.hint": Record<never, never>;
  "desktop.script.ended.label": {
    duration: string | number;
    exitCode: string | number;
    state: string | number;
  };
  "desktop.script.endedNoCode.label": {
    duration: string | number;
    state: string | number;
  };
  "desktop.script.failedTail.label": Record<never, never>;
  "desktop.script.input.aria": Record<never, never>;
  "desktop.script.input.placeholder": Record<never, never>;
  "desktop.script.inputDisabled.hint": Record<never, never>;
  "desktop.script.running.label": {
    duration: string | number;
    state: string | number;
  };
  "desktop.script.stale.label": Record<never, never>;
  "desktop.script.staleNotice.label": Record<never, never>;
  "desktop.slow.body": Record<never, never>;
  "desktop.slow.title": Record<never, never>;
  "desktop.start.body": {
    folder: string | number;
  };
  "desktop.start.hint": Record<never, never>;
  "desktop.start.running.label": Record<never, never>;
  "desktop.start.stop.action": Record<never, never>;
  "desktop.start.title": {
    name: string | number;
  };
  "desktop.state.idle.label": Record<never, never>;
  "desktop.stop.action": Record<never, never>;
  "desktop.stopped.body": Record<never, never>;
  "desktop.tab.cli.label": Record<never, never>;
  "desktop.templates.create.action": Record<never, never>;
  "desktop.templates.detail.aria": Record<never, never>;
  "desktop.templates.detailGone.hint": Record<never, never>;
  "desktop.templates.edit.hint": Record<never, never>;
  "desktop.templates.empty.hint": Record<never, never>;
  "desktop.templates.fallback.hint": {
    fallback: string | number;
    tool: string | number;
  };
  "desktop.templates.files.title": Record<never, never>;
  "desktop.templates.filesEmpty.hint": Record<never, never>;
  "desktop.templates.hereColumn.label": Record<never, never>;
  "desktop.templates.invalid.label": Record<never, never>;
  "desktop.templates.list.aria": Record<never, never>;
  "desktop.templates.loadFailed.hint": Record<never, never>;
  "desktop.templates.problemEntry.label": Record<never, never>;
  "desktop.templates.problemFormat.label": Record<never, never>;
  "desktop.templates.problemName.label": Record<never, never>;
  "desktop.templates.problemOther.label": {
    rule: string | number;
  };
  "desktop.templates.problemReserved.label": Record<never, never>;
  "desktop.templates.problemRunner.label": Record<never, never>;
  "desktop.templates.problemTemplateJson.label": Record<never, never>;
  "desktop.templates.rangeAnd.label": Record<never, never>;
  "desktop.templates.readyLog.label": {
    match: string | number;
  };
  "desktop.templates.readyPort.label": Record<never, never>;
  "desktop.templates.requiredColumn.label": Record<never, never>;
  "desktop.templates.requires.title": Record<never, never>;
  "desktop.templates.requiresNone.hint": Record<never, never>;
  "desktop.templates.run.title": Record<never, never>;
  "desktop.templates.runInstall.label": Record<never, never>;
  "desktop.templates.runReady.label": Record<never, never>;
  "desktop.templates.runStart.label": Record<never, never>;
  "desktop.templates.sourceBuiltin.label": Record<never, never>;
  "desktop.templates.sourceUser.label": Record<never, never>;
  "desktop.templates.statusColumn.label": Record<never, never>;
  "desktop.templates.statusMet.label": Record<never, never>;
  "desktop.templates.statusMissing.label": Record<never, never>;
  "desktop.templates.statusTooOld.label": Record<never, never>;
  "desktop.templates.summary.label": {
    builtin: number;
    user: number;
  };
  "desktop.templates.title": Record<never, never>;
  "desktop.templates.toolColumn.label": Record<never, never>;
  "desktop.templates.unmaintained.label": Record<never, never>;
  "desktop.terminal.aria": Record<never, never>;
  "desktop.terminal.endedExited.label": {
    exitCode: string | number;
  };
  "desktop.terminal.endedHostCrashed.label": Record<never, never>;
  "desktop.terminal.endedRenamed.label": Record<never, never>;
  "desktop.terminal.endedSignal.label": Record<never, never>;
  "desktop.terminal.endedStartFailed.label": Record<never, never>;
  "desktop.terminal.reopen.action": Record<never, never>;
  "desktop.terminal.shellFallback.label": {
    fallback: string | number;
    reason: string;
    shell: string | number;
  };
  "desktop.terminalFind.aria": Record<never, never>;
  "desktop.terminalFind.case.aria": Record<never, never>;
  "desktop.terminalFind.case.label": Record<never, never>;
  "desktop.terminalFind.close.aria": Record<never, never>;
  "desktop.terminalFind.count.label": {
    index: string | number;
    total: string | number;
  };
  "desktop.terminalFind.field.aria": Record<never, never>;
  "desktop.terminalFind.next.aria": Record<never, never>;
  "desktop.terminalFind.none.label": Record<never, never>;
  "desktop.terminalFind.previous.aria": Record<never, never>;
  "desktop.terminalFind.regex.aria": Record<never, never>;
  "desktop.terminalFind.regex.label": Record<never, never>;
  "desktop.terminalFind.word.aria": Record<never, never>;
  "desktop.terminalFind.word.label": Record<never, never>;
  "desktop.terminalMenu.aria": Record<never, never>;
  "desktop.terminalMenu.clear.action": Record<never, never>;
  "desktop.terminalMenu.clear.hint": Record<never, never>;
  "desktop.terminalMenu.copy.action": Record<never, never>;
  "desktop.terminalMenu.copy.hint": Record<never, never>;
  "desktop.terminalMenu.paste.action": Record<never, never>;
  "desktop.terminalMenu.paste.hint": Record<never, never>;
  "desktop.terminalMenu.selectAll.action": Record<never, never>;
  "desktop.terminalMenu.selectAll.hint": Record<never, never>;
  "desktop.update.banner.label": {
    current: string | number;
    latest: string | number;
  };
  "desktop.update.download.action": Record<never, never>;
  "desktop.update.later.action": Record<never, never>;
  "desktop.update.region.aria": Record<never, never>;
  "desktop.urlConfirm.cancel.action": Record<never, never>;
  "desktop.urlConfirm.claimed.label": Record<never, never>;
  "desktop.urlConfirm.confirm.action": Record<never, never>;
  "desktop.urlConfirm.folder.label": Record<never, never>;
  "desktop.urlConfirm.from.label": Record<never, never>;
  "desktop.urlConfirm.name.label": Record<never, never>;
  "desktop.urlConfirm.preview.label": {
    name: string | number;
    user: (chunks: string[]) => string;
  };
  "desktop.urlConfirm.source.label": Record<never, never>;
  "desktop.urlConfirm.template.label": Record<never, never>;
  "desktop.urlConfirm.title": Record<never, never>;
  "desktop.urlConfirm.unknown.label": Record<never, never>;
  "desktop.urlConfirm.warning.label": Record<never, never>;
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
  "library.action.dismiss.action": Record<never, never>;
  "library.action.failed.title": Record<never, never>;
  "library.autoClean.dialog.title": Record<never, never>;
  "library.clean.keep.action": Record<never, never>;
  "library.clean.later.action": Record<never, never>;
  "library.clean.now.action": Record<never, never>;
  "library.cleanBanner.end.label": Record<never, never>;
  "library.cleanBanner.idle.label": {
    days: number;
  };
  "library.cleanBanner.lead.label": {
    count: number;
  };
  "library.cleanBanner.region.aria": Record<never, never>;
  "library.cleanBanner.separator.label": Record<never, never>;
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
  "library.creator.collapse.aria": Record<never, never>;
  "library.creator.details.label": {
    agent: string | number;
    code: (chunks: string[]) => string;
    command: string | number;
    hasCommand: string;
    time: string | number;
    user: (chunks: string[]) => string;
  };
  "library.creator.expand.aria": Record<never, never>;
  "library.creator.me.label": Record<never, never>;
  "library.creator.tooltip.label": {
    command: string | number;
    hasCommand: string;
    time: string | number;
  };
  "library.empty.cli.label": Record<never, never>;
  "library.empty.hint": Record<never, never>;
  "library.empty.title": Record<never, never>;
  "library.filter.agent.label": Record<never, never>;
  "library.filter.all.label": Record<never, never>;
  "library.filter.autoClean.label": Record<never, never>;
  "library.filter.combined.label": Record<never, never>;
  "library.filter.kept.label": Record<never, never>;
  "library.filter.sort.label": {
    value: string | number;
  };
  "library.filter.status.label": {
    value: string | number;
  };
  "library.filter.type.label": {
    value: string | number;
  };
  "library.menu.sort.aria": Record<never, never>;
  "library.menu.status.aria": Record<never, never>;
  "library.menu.type.aria": Record<never, never>;
  "library.missing.body": {
    mono: (chunks: string[]) => string;
    path: string | number;
  };
  "library.missing.mismatch.label": {
    name: string | number;
    user: (chunks: string[]) => string;
  };
  "library.missing.revealParent.action": Record<never, never>;
  "library.missing.status.label": Record<never, never>;
  "library.nav.aria": Record<never, never>;
  "library.nav.library.title": Record<never, never>;
  "library.nav.manage.title": Record<never, never>;
  "library.nav.settings.label": Record<never, never>;
  "library.nav.templates.label": Record<never, never>;
  "library.nav.unused.label": Record<never, never>;
  "library.noResults.clear.action": Record<never, never>;
  "library.noResults.create.action": {
    query: string | number;
  };
  "library.noResults.filtered.hint": Record<never, never>;
  "library.noResults.filtered.title": Record<never, never>;
  "library.noResults.hint": Record<never, never>;
  "library.noResults.reset.action": Record<never, never>;
  "library.noResults.title": {
    query: string | number;
  };
  "library.note.dialog.title": Record<never, never>;
  "library.note.empty.label": Record<never, never>;
  "library.page.results.label": {
    count: number;
    root: string | number;
    total: number;
  };
  "library.page.summary.label": {
    root: string | number;
    running: number;
    total: number;
  };
  "library.rename.dialog.title": Record<never, never>;
  "library.rename.nameFolder.hint": Record<never, never>;
  "library.rename.nameRunning.hint": Record<never, never>;
  "library.rename.save.action": Record<never, never>;
  "library.rename.terminalClose.hint": Record<never, never>;
  "library.rename.terminalCommand.hint": {
    command: string | number;
  };
  "library.retention.autoClean.label": {
    days: number;
  };
  "library.retention.autoClean.tooltip": {
    days: number;
  };
  "library.retention.kept.label": Record<never, never>;
  "library.retention.tomorrow.label": Record<never, never>;
  "library.row.autoClean.action": Record<never, never>;
  "library.row.autoCleanNow.hint": {
    state: string | number;
  };
  "library.row.copyLink.action": Record<never, never>;
  "library.row.copyPath.action": Record<never, never>;
  "library.row.duplicate.action": Record<never, never>;
  "library.row.editNote.action": Record<never, never>;
  "library.row.forget.action": Record<never, never>;
  "library.row.more.aria": {
    name: string | number;
  };
  "library.row.open.action": Record<never, never>;
  "library.row.openHint.label": Record<never, never>;
  "library.row.openInEditor.action": Record<never, never>;
  "library.row.openOnly.action": Record<never, never>;
  "library.row.openTerminal.action": Record<never, never>;
  "library.row.relocate.action": Record<never, never>;
  "library.row.rename.action": Record<never, never>;
  "library.row.renameBusy.hint": Record<never, never>;
  "library.row.reveal.action": Record<never, never>;
  "library.row.saveAsTemplate.action": Record<never, never>;
  "library.row.stop.action": Record<never, never>;
  "library.row.trash.action": Record<never, never>;
  "library.search.clear.aria": Record<never, never>;
  "library.search.expand.aria": Record<never, never>;
  "library.search.key.label": Record<never, never>;
  "library.search.label": Record<never, never>;
  "library.search.placeholder": Record<never, never>;
  "library.search.short.placeholder": Record<never, never>;
  "library.sidebar.collapse.label": Record<never, never>;
  "library.sidebar.expand.label": Record<never, never>;
  "library.sidebar.footer.label": {
    count: number;
  };
  "library.sort.created.label": Record<never, never>;
  "library.sort.name.label": Record<never, never>;
  "library.sort.recent.label": Record<never, never>;
  "library.status.problem.label": Record<never, never>;
  "library.status.running.label": Record<never, never>;
  "library.status.stopped.label": Record<never, never>;
  "library.tab.title": Record<never, never>;
  "library.table.aria": Record<never, never>;
  "library.topbar.idle.label": Record<never, never>;
  "library.topbar.running.label": {
    count: number;
  };
  "library.trash.body": {
    running: string;
    terminalCommand: string;
  };
  "library.trash.cancel.action": Record<never, never>;
  "library.trash.confirm.action": Record<never, never>;
  "library.trash.title": {
    name: string | number;
  };
  "platform.clearShortcut": Record<never, never>;
  "platform.copyShortcut": Record<never, never>;
  "platform.fileManager": Record<never, never>;
  "platform.pasteShortcut": Record<never, never>;
  "platform.searchShortcut": Record<never, never>;
  "platform.selectAllShortcut": Record<never, never>;
  "platform.trash": Record<never, never>;
  "settings.autoSave.blur.label": Record<never, never>;
  "settings.autoSave.delay.label": Record<never, never>;
  "settings.autoSave.hint": Record<never, never>;
  "settings.autoSave.off.label": Record<never, never>;
  "settings.autoSave.title": Record<never, never>;
  "settings.builtinSkip.hint": Record<never, never>;
  "settings.builtinSkip.title": Record<never, never>;
  "settings.cli.available.label": {
    version: string | number;
  };
  "settings.cli.command.title": Record<never, never>;
  "settings.cli.conflict.hint": Record<never, never>;
  "settings.cli.conflict.label": Record<never, never>;
  "settings.cli.copyCommand.action": Record<never, never>;
  "settings.cli.diagnostics.action": Record<never, never>;
  "settings.cli.diagnostics.title": Record<never, never>;
  "settings.cli.exportDone.label": Record<never, never>;
  "settings.cli.exportFailed.label": Record<never, never>;
  "settings.cli.failed.body": Record<never, never>;
  "settings.cli.install.action": Record<never, never>;
  "settings.cli.missing.label": Record<never, never>;
  "settings.cli.notOnPath.body": {
    dir: string | number;
  };
  "settings.cli.remove.action": Record<never, never>;
  "settings.cli.stale.label": Record<never, never>;
  "settings.cli.title": Record<never, never>;
  "settings.cli.unavailable.hint": Record<never, never>;
  "settings.cli.unavailable.label": Record<never, never>;
  "settings.confirmClose.hint": Record<never, never>;
  "settings.confirmClose.title": Record<never, never>;
  "settings.deps.title": Record<never, never>;
  "settings.dialog.cancel.action": Record<never, never>;
  "settings.editRun.title": Record<never, never>;
  "settings.editor.cursor.label": Record<never, never>;
  "settings.editor.default.label": Record<never, never>;
  "settings.editor.hint": Record<never, never>;
  "settings.editor.sublime.label": Record<never, never>;
  "settings.editor.title": Record<never, never>;
  "settings.editor.vscode.label": Record<never, never>;
  "settings.editor.webstorm.label": Record<never, never>;
  "settings.editor.zed.label": Record<never, never>;
  "settings.general.title": Record<never, never>;
  "settings.idleStop.hint": Record<never, never>;
  "settings.idleStop.hour2.label": Record<never, never>;
  "settings.idleStop.min15.label": Record<never, never>;
  "settings.idleStop.min30.label": Record<never, never>;
  "settings.idleStop.title": Record<never, never>;
  "settings.language.en.label": Record<never, never>;
  "settings.language.hint": Record<never, never>;
  "settings.language.title": Record<never, never>;
  "settings.language.zhCN.label": Record<never, never>;
  "settings.libraryRoot.change.action": Record<never, never>;
  "settings.libraryRoot.confirm.body": Record<never, never>;
  "settings.libraryRoot.confirm.title": {
    path: string | number;
  };
  "settings.libraryRoot.continue.action": Record<never, never>;
  "settings.libraryRoot.move.action": Record<never, never>;
  "settings.libraryRoot.protected.body": Record<never, never>;
  "settings.libraryRoot.protected.title": Record<never, never>;
  "settings.libraryRoot.reveal.action": Record<never, never>;
  "settings.libraryRoot.title": Record<never, never>;
  "settings.noProxyLocal.title": Record<never, never>;
  "settings.page.aria": Record<never, never>;
  "settings.page.title": Record<never, never>;
  "settings.pm.auto.label": Record<never, never>;
  "settings.pm.hint": Record<never, never>;
  "settings.pm.npm.label": Record<never, never>;
  "settings.pm.pnpm.label": Record<never, never>;
  "settings.pm.title": Record<never, never>;
  "settings.proxy.example.placeholder": Record<never, never>;
  "settings.proxy.hint": Record<never, never>;
  "settings.proxy.inherited.hint": Record<never, never>;
  "settings.proxy.invalid.body": Record<never, never>;
  "settings.proxy.title": Record<never, never>;
  "settings.registry.example.placeholder": Record<never, never>;
  "settings.registry.hint": Record<never, never>;
  "settings.registry.inherited.hint": Record<never, never>;
  "settings.registry.invalid.body": Record<never, never>;
  "settings.registry.title": Record<never, never>;
  "settings.runNote.label": Record<never, never>;
  "settings.runtime.and.label": Record<never, never>;
  "settings.runtime.arch.label": Record<never, never>;
  "settings.runtime.command.label": Record<never, never>;
  "settings.runtime.copy.action": Record<never, never>;
  "settings.runtime.current.label": Record<never, never>;
  "settings.runtime.envFailed.body": Record<never, never>;
  "settings.runtime.found.label": Record<never, never>;
  "settings.runtime.installed.label": Record<never, never>;
  "settings.runtime.invalidPath.body": {
    tool: string | number;
  };
  "settings.runtime.missing.label": Record<never, never>;
  "settings.runtime.missing.title": {
    tool: string | number;
  };
  "settings.runtime.need.label": Record<never, never>;
  "settings.runtime.note.label": Record<never, never>;
  "settings.runtime.path.label": Record<never, never>;
  "settings.runtime.pathFailed.body": Record<never, never>;
  "settings.runtime.recheck.action": Record<never, never>;
  "settings.runtime.runInstall.action": Record<never, never>;
  "settings.runtime.setPath.action": Record<never, never>;
  "settings.runtime.site.label": Record<never, never>;
  "settings.runtime.status.label": Record<never, never>;
  "settings.runtime.table.aria": Record<never, never>;
  "settings.runtime.title": Record<never, never>;
  "settings.runtime.tooOld.label": Record<never, never>;
  "settings.runtime.tooOld.title": {
    tool: string | number;
  };
  "settings.runtime.tool.label": Record<never, never>;
  "settings.runtime.toolName.label": {
    tool: string | number;
  };
  "settings.runtime.unknown.label": Record<never, never>;
  "settings.runtime.version.label": Record<never, never>;
  "settings.scriptAutoRun.hint": Record<never, never>;
  "settings.scriptAutoRun.title": Record<never, never>;
  "settings.skills.agents.label": Record<never, never>;
  "settings.skills.agentsName.label": Record<never, never>;
  "settings.skills.both.label": Record<never, never>;
  "settings.skills.claude.label": Record<never, never>;
  "settings.skills.claudeName.label": Record<never, never>;
  "settings.skills.hint": Record<never, never>;
  "settings.skills.none.label": Record<never, never>;
  "settings.skills.other.action": Record<never, never>;
  "settings.skills.title": Record<never, never>;
  "settings.supervisor.confirm.body": {
    cli: number;
    tab: number;
  };
  "settings.supervisor.confirm.title": Record<never, never>;
  "settings.supervisor.hint": Record<never, never>;
  "settings.supervisor.running.label": {
    count: number;
  };
  "settings.supervisor.stop.action": Record<never, never>;
  "settings.supervisor.stopped.label": Record<never, never>;
  "settings.supervisor.title": Record<never, never>;
  "settings.theme.dark.label": Record<never, never>;
  "settings.theme.hint": Record<never, never>;
  "settings.theme.light.label": Record<never, never>;
  "settings.theme.system.label": Record<never, never>;
  "settings.theme.title": Record<never, never>;
  "settings.updateCheck.hint": Record<never, never>;
  "settings.updateCheck.title": Record<never, never>;
  "workspace.attached.adopt.action": Record<never, never>;
  "workspace.attached.aria": Record<never, never>;
  "workspace.attached.hint": Record<never, never>;
  "workspace.attached.stop.action": Record<never, never>;
  "workspace.attached.title": {
    agent: string | number;
    ago: string | number;
  };
  "workspace.attached.titlePlain.label": {
    ago: string | number;
  };
  "workspace.closeConfirm.body": Record<never, never>;
  "workspace.closeConfirm.cancel.action": Record<never, never>;
  "workspace.closeConfirm.close.action": Record<never, never>;
  "workspace.closeConfirm.confirm.action": Record<never, never>;
  "workspace.closeConfirm.optOut.hint": Record<never, never>;
  "workspace.closeConfirm.optOut.label": Record<never, never>;
  "workspace.closeConfirm.terminal.body": {
    command: string | number;
    stopsRun: string;
  };
  "workspace.closeConfirm.terminal.title": {
    name: string | number;
  };
  "workspace.closeConfirm.title": {
    name: string | number;
  };
  "workspace.duration.hoursMinutes.label": {
    hours: string | number;
    minutes: string | number;
  };
  "workspace.files.add.aria": Record<never, never>;
  "workspace.files.collapse.label": Record<never, never>;
  "workspace.files.create.aria": Record<never, never>;
  "workspace.files.empty.hint": Record<never, never>;
  "workspace.files.expand.label": Record<never, never>;
  "workspace.files.failed.hint": Record<never, never>;
  "workspace.files.menu.aria": Record<never, never>;
  "workspace.files.nameExists.hint": {
    name: string | number;
  };
  "workspace.files.nameInvalid.hint": {
    reason: string;
  };
  "workspace.files.newFile.action": Record<never, never>;
  "workspace.files.newFolder.action": Record<never, never>;
  "workspace.files.notFound.hint": {
    name: string | number;
  };
  "workspace.files.notice.aria": Record<never, never>;
  "workspace.files.outside.hint": Record<never, never>;
  "workspace.files.rename.aria": Record<never, never>;
  "workspace.files.renameItem.action": Record<never, never>;
  "workspace.files.renameItem.hint": Record<never, never>;
  "workspace.files.saveFailed.hint": {
    name: string | number;
    reason: string;
  };
  "workspace.files.title.label": Record<never, never>;
  "workspace.files.trashFailed.hint": {
    name: string | number;
  };
  "workspace.files.trashItem.action": Record<never, never>;
  "workspace.files.trashed.hint": Record<never, never>;
  "workspace.files.tree.aria": Record<never, never>;
  "workspace.resize.console.label": Record<never, never>;
  "workspace.resize.hint": Record<never, never>;
  "workspace.resize.preview.label": Record<never, never>;
  "workspace.resize.tree.label": Record<never, never>;
  "workspace.running.aria": Record<never, never>;
  "workspace.running.footer.hint": Record<never, never>;
  "workspace.running.idle.hint": Record<never, never>;
  "workspace.running.open.aria": {
    name: string | number;
  };
  "workspace.running.sourceCli.label": {
    agent: string | number;
  };
  "workspace.running.sourceCliPlain.label": Record<never, never>;
  "workspace.running.sourceTab.label": Record<never, never>;
  "workspace.running.stop.action": Record<never, never>;
  "workspace.running.stop.aria": {
    name: string | number;
  };
  "workspace.running.stopAll.action": Record<never, never>;
  "workspace.running.title": Record<never, never>;
  "workspace.running.uptime.label": {
    duration: string | number;
  };
  "workspace.tab.close.label": {
    name: string | number;
  };
  "workspace.tabs.aria": Record<never, never>;
  "workspace.tabs.more.aria": Record<never, never>;
};
