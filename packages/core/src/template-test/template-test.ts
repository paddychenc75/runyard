import { dirname } from "node:path";
import {
  type AbsPath,
  absPath,
  type Disposable,
  joinPath,
  type Platform,
  posixRelPath,
} from "@runyard/platform";
import {
  type RunKind,
  type Runner,
  type Template,
  type TemplateTestStep,
  validateRunner,
  validateTemplate,
} from "@runyard/protocol";
import { LibraryError, libraryError } from "../library/library-error.ts";
import type { RunSubject } from "../prepare/prepare-types.ts";
import { createRunPreparer } from "../prepare/run-preparer.ts";
import { createReadinessProbe } from "../run/readiness-probe.ts";
import { RunEngine } from "../run/run-engine.ts";
import type { Run } from "../run/run-handle.ts";
import type { PrepareOutcome } from "../run/run-types.ts";
import { ScriptRuns } from "../scripts/script-runs.ts";
import { createStaticServer } from "../static/static-server.ts";
import { locateTemplate } from "../templates/locate-template.ts";
import { readToolDefinitions } from "../templates/read-tool-definitions.ts";
import { createTemplateCatalog } from "../templates/template-catalog.ts";
import { ToolchainService } from "../toolchain/toolchain-service.ts";
import { isolatedPlatform } from "./isolated-platform.ts";
import {
  bounded,
  changedEntry,
  pageText,
  parseTemplateInput,
  previewPath,
  until,
} from "./probes.ts";
import { type TemplateTestDriver, type TemplateTestResult, testWorkflow } from "./test-workflow.ts";
import { requestedToolPaths } from "./tool-versions.ts";

export type { TemplateTestOptions } from "./template-test-options.ts";

import type { TemplateTestOptions } from "./template-test-options.ts";

class TemplateRuntime implements TemplateTestDriver {
  readonly #options: TemplateTestOptions;
  #platform: Platform;
  #root?: AbsPath;
  #folder?: AbsPath;
  #template?: Template;
  #runner?: Runner;
  #subject?: RunSubject;
  #engine?: RunEngine;
  #scripts?: ScriptRuns;
  #watcher?: Disposable;
  #first?: Run;
  #versions: Record<string, string> = {};
  #runIds = new Set<string>();
  #ports = new Set<number>();
  #logs = new Map<string, string[]>();
  #spawned?: () => void;
  #interrupted?: Promise<void>;
  #interruptError: unknown;
  #onCancel = () => {
    this.#interrupted = this.#killMarked().catch((error) => {
      this.#interruptError = error;
    });
  };
  #counter = 0;
  #prepareAbort?: AbortController;
  #prepareWork?: Promise<PrepareOutcome>;
  constructor(options: TemplateTestOptions) {
    this.#options = options;
    this.#platform = options.platform;
    options.signal?.addEventListener("abort", this.#onCancel, { once: true });
  }
  kind(): RunKind {
    return this.#runner?.kind ?? "server";
  }
  versions() {
    return this.#versions;
  }
  async step(step: TemplateTestStep): Promise<void> {
    if (this.#options.signal?.aborted && step !== "stop" && step !== "leftovers")
      throw new Error("template test cancelled");
    switch (step) {
      case "create":
        return this.#create();
      case "install":
        return this.#install();
      case "start":
        return this.#start();
      case "ready":
        return this.#ready();
      case "reload":
        return this.#reload();
      case "stop":
        return this.#stop();
      case "leftovers":
        return this.#leftovers();
    }
  }
  async #create(): Promise<void> {
    const o = this.#options;
    const root = await o.workspace.create();
    this.#root = root;
    const home = joinPath(root, posixRelPath("home"));
    this.#folder = joinPath(root, posixRelPath("project"));
    await o.platform.fs.makeDir(home);
    await o.platform.fs.makeDir(this.#folder);
    this.#platform = isolatedPlatform(o.platform, home, o.marker, o.signal, (marker) =>
      this.#runIds.add(marker),
    );
    const target = await locateTemplate(this.#platform, o.locations, o.template);
    if (!target)
      throw libraryError("TEMPLATE_NOT_FOUND", { template: o.template }, "template not found");
    const text = await this.#platform.fs.readText(
      joinPath(target.dir, posixRelPath("template.json")),
    );
    const parsed = validateTemplate(parseTemplateInput(text, o.template));
    if (parsed.value === undefined)
      throw libraryError("TEMPLATE_INVALID", { template: o.template }, "invalid template");
    this.#template = parsed.value;
    const runnerText = await this.#platform.fs.readText(
      joinPath(o.locations.runnersDir, posixRelPath(`${parsed.value.runner}/runner.json`)),
    );
    const runner = validateRunner(parseTemplateInput(runnerText, o.template));
    if (runner.value === undefined)
      throw libraryError("TEMPLATE_INVALID", { template: o.template }, "invalid runner");
    this.#runner = runner.value;
    const seed = await createTemplateCatalog({
      platform: this.#platform,
      locations: o.locations,
      appVersion: o.appVersion,
    }).seed({ template: o.template, name: `test-${o.template}`, vars: {} });
    for await (const file of seed.files) {
      if (o.signal?.aborted) throw new Error("template test cancelled");
      const path = joinPath(this.#folder, file.path);
      await this.#platform.fs.makeDir(absPath(dirname(path)));
      await this.#platform.fs.writeFile(path, file.contents);
    }
    this.#subject = {
      folder: this.#folder,
      runner: this.#runner,
      requires: this.#template.requires,
      entry: this.#template.entry,
      otherRegisteredPorts: new Set(),
    };
  }
  async #install(): Promise<void> {
    const o = this.#options;
    const platform = this.#platform;
    const subject = this.#subject;
    if (!subject) throw new Error("not created");
    const definitions = await readToolDefinitions(platform, o.locations.toolsDir);
    const paths = await requestedToolPaths(
      platform,
      o.clock,
      definitions,
      subject.folder,
      o.toolVersions ?? {},
      o.toolPaths ?? {},
      o.signal,
    );
    const toolchain = new ToolchainService({
      platform,
      clock: o.clock,
      definitions,
      toolPaths: () => paths,
      onChanged: () => {},
    });
    const preparer = createRunPreparer({
      platform,
      clock: o.clock,
      definitions,
      toolchain,
      resolve: async () => subject,
      serveStatic: createStaticServer({ platform }),
    });
    this.#prepareAbort = new AbortController();
    this.#prepareWork = preparer.prepare({
      runId: `${o.marker}-prepare`,
      request: this.#request(),
      signal: this.#prepareAbort.signal,
      report: () => {},
      log: () => {},
    });
    const prepared = await bounded(o.clock, o.template, this.#prepareWork, 120000, o.signal);
    const checked = await toolchain.check({
      requires: subject.requires,
      cwd: subject.folder,
      cachedOnly: true,
    });
    this.#versions = Object.fromEntries(
      checked.tools.flatMap((tool) => (tool.version ? [[tool.tool, tool.version]] : [])),
    );
    if (!prepared.ok) throw new LibraryError(prepared.failure);
    this.#engine = new RunEngine({
      platform,
      clock: o.clock,
      preparer,
      readiness: createReadinessProbe({ clock: o.clock }),
      removeDir: o.workspace.remove,
      newRunId: () => {
        const id = `${o.marker}-${++this.#counter}`;
        this.#runIds.add(id);
        return id;
      },
      sinks: {
        spawned: () => this.#spawned?.(),
        state: () => {},
        log: (id, entry) => {
          if (entry.kind === "stdout" || entry.kind === "stderr")
            this.#logs.set(id, [...(this.#logs.get(id) ?? []), entry.text].slice(-200));
        },
      },
    });
    this.#scripts = new ScriptRuns({
      platform,
      clock: o.clock,
      engine: this.#engine,
      toolchain,
      resolve: async () => subject,
      autoRunEnabled: async () => true,
    });
  }
  #request() {
    return {
      playgroundId: this.#options.marker,
      name: this.#options.template,
      kind: this.kind(),
      owner: { kind: "cli", command: "template test" } as const,
    };
  }
  #out(run: Run) {
    return (this.#logs.get(run.runId) ?? []).join("\n");
  }
  async #start(): Promise<void> {
    if (!this.#engine || !this.#scripts) throw new Error("not prepared");
    const spawned = new Promise<void>((resolve) => {
      this.#spawned = resolve;
    });
    const result = this.#engine.start(this.#request());
    this.#first = result.run;
    const terminal = result.run.waitFor([
      "ready",
      "finished",
      "errored",
      "failed",
      "crashed",
      "stopped",
    ]);
    await bounded(
      this.#options.clock,
      this.#options.template,
      this.kind() === "oneshot" ? terminal : Promise.race([spawned, terminal]),
      60000,
      this.#options.signal,
    );
    this.#spawned = undefined;
    const error = result.run.error();
    if (error) throw new LibraryError(error);
    const port = result.run.snapshot().port;
    if (port !== undefined) this.#ports.add(port);
  }
  async #ready(): Promise<void> {
    const run = this.#first;
    if (!run) throw new Error("not started");
    await bounded(
      this.#options.clock,
      this.#options.template,
      run.waitFor(["ready", "failed", "crashed", "stopped"]),
      60000,
      this.#options.signal,
    );
    const error = run.error();
    if (error) throw new LibraryError(error);
    if (run.state !== "ready") throw new Error("server did not become ready");
    const port = this.#first?.snapshot().port;
    if (port === undefined) throw new Error("no ready port");
    await pageText(port, previewPath(this.#runner));
    if (!(await this.#platform.ports.loopbackOnly(port)))
      throw new Error("server is not loopback-only");
  }
  async #reload(): Promise<void> {
    const o = this.#options;
    const first = this.#first;
    const folder = this.#folder;
    const template = this.#template;
    if (!first || !folder || !template || !this.#engine || !this.#scripts)
      throw new Error("not started");
    const file = joinPath(folder, posixRelPath(template.entry));
    const source = await this.#platform.fs.readText(file);
    if (source === null) throw new Error("entry is missing");
    const marker = `runyard-smoke-${o.marker}`;
    this.#watcher = await this.#scripts.watch(this.#request());
    const before = this.#out(first);
    await this.#platform.fs.writeFile(
      file,
      changedEntry(template.entry, source, marker, this.kind() === "oneshot"),
    );
    if (this.kind() === "oneshot") {
      await until(
        o.clock,
        "script reload",
        async () => {
          const next = this.#engine?.current(o.marker);
          return (
            next !== undefined &&
            next.runId !== first.runId &&
            next.state === "finished" &&
            this.#out(next) !== before &&
            this.#out(next).includes(marker)
          );
        },
        30000,
        o.signal,
      );
    } else {
      const port = first.snapshot().port;
      if (port === undefined) throw new Error("no port");
      await until(
        o.clock,
        "page reload",
        async () => {
          for (const path of [
            previewPath(this.#runner),
            `/${template.entry.split("/").map(encodeURIComponent).join("/")}`,
          ]) {
            const body = await pageText(port, path).catch(() => "");
            if (body.includes(marker)) return true;
          }
          return false;
        },
        30000,
        o.signal,
      );
    }
  }
  async #stop(): Promise<void> {
    this.#prepareAbort?.abort();
    await this.#interrupted;
    await this.#prepareWork?.catch(() => undefined);
    await this.#watcher?.dispose();
    this.#watcher = undefined;
    await this.#engine?.stopAll();
  }
  async #leftovers(): Promise<void> {
    for (const id of this.#runIds)
      if (
        (await this.#platform.proc.findByMarker({ name: "RUNYARD_RUN_ID", value: id })).length > 0
      )
        throw new Error("owned processes remain");
    for (const port of this.#ports)
      if ((await this.#platform.ports.isFree(port)) !== "free")
        throw new Error("port is still occupied");
  }
  async #killMarked(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.#runIds].map(async (id) => {
        const refs = await this.#platform.proc.findByMarker({ name: "RUNYARD_RUN_ID", value: id });
        const stopped = await Promise.allSettled(
          refs.map((ref) =>
            this.#platform.proc.terminate(ref, { mode: "graceful", graceMs: 2000 }),
          ),
        );
        const failed = stopped.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  async dispose(keep: boolean): Promise<string | undefined> {
    // 工作流已记录stop步骤的失败；仍继续尽力清理本次标记的进程，不能在第一个错误处退出。
    await this.#stop().catch(() => undefined);
    this.#options.signal?.removeEventListener("abort", this.#onCancel);
    await this.#killMarked();
    if (this.#interruptError) throw this.#interruptError;
    if (keep) return this.#folder;
    if (this.#root) await this.#options.workspace.remove(this.#root);
    return undefined;
  }
}
export async function testTemplate(options: TemplateTestOptions): Promise<TemplateTestResult> {
  return testWorkflow(
    options.template,
    new TemplateRuntime(options),
    options.clock,
    options.keepDir ?? false,
  );
}
