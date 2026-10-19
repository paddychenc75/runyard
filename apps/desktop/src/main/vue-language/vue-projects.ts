export type LanguageTarget = "vue" | "ts";
export interface LanguageDocument {
  file: string;
  text: string;
  version: number;
}
export interface VueSession {
  request(target: LanguageTarget, method: string, params: unknown): Promise<unknown>;
  sync(document: LanguageDocument): Promise<void>;
  closeDocument(file: string): Promise<void>;
  stop(): Promise<void>;
}
interface Project {
  folder: string;
  failures: number;
  session: VueSession | null;
  documents: Map<string, LanguageDocument>;
}
export type VueStatus = "ready" | "restarting" | "disabled" | "closed";

/** 串行拥有进程组，淘汰与崩溃恢复先等旧组退出，避免瞬间超过两组。 */
export class VueProjects {
  readonly #projects = new Map<string, Project>();
  #tail: Promise<unknown> = Promise.resolve();
  #disposed = false;
  private readonly launch: (folder: string, failed: () => void) => Promise<VueSession>;
  private readonly status: (id: string, status: VueStatus) => void;
  constructor(
    launch: (folder: string, failed: () => void) => Promise<VueSession>,
    status: (id: string, status: VueStatus) => void = () => {},
  ) {
    this.launch = launch;
    this.status = status;
  }
  #serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task);
    this.#tail = result.catch(() => undefined);
    return result;
  }
  idle(): Promise<unknown> {
    return this.#tail;
  }
  open(id: string, folder: string): Promise<VueSession> {
    return this.#serial(() => this.#open(id, folder));
  }
  async #open(id: string, folder: string): Promise<VueSession> {
    if (this.#disposed) throw new Error("LANGUAGE_DISPOSED");
    let project = this.#projects.get(id);
    if (project && project.folder !== folder) {
      await this.#close(id);
      project = undefined;
    }
    if (!project) {
      const active = [...this.#projects].filter(([, item]) => item.session);
      if (active.length >= 2 && active[0]) await this.#close(active[0][0]);
      project = { folder, failures: 0, session: null, documents: new Map() };
      this.#projects.set(id, project);
    }
    this.#projects.delete(id);
    this.#projects.set(id, project);
    if (!project.session) await this.#start(id, project);
    if (!project.session) throw new Error("LANGUAGE_DISABLED");
    return project.session;
  }
  sync(id: string, folder: string, document: LanguageDocument): Promise<void> {
    return this.#serial(async () => {
      const session = await this.#open(id, folder);
      const project = this.#projects.get(id);
      if (!project) return;
      project.documents.set(document.file, document);
      await session.sync(document);
    });
  }
  async closeDocument(id: string, file: string): Promise<void> {
    await this.#serial(async () => {
      const project = this.#projects.get(id);
      project?.documents.delete(file);
      await project?.session?.closeDocument(file);
    });
  }
  async #start(id: string, project: Project): Promise<void> {
    while (project.failures < 3) {
      let starting = true;
      let startupFailed = false;
      try {
        const session = await this.launch(project.folder, () => {
          if (starting) {
            startupFailed = true;
            return;
          }
          void this.#serial(async () => {
            if (this.#projects.get(id) !== project || project.session !== session) return;
            project.session = null;
            project.failures++;
            await session.stop();
            this.status(id, "restarting");
            await this.#start(id, project);
          });
        });
        starting = false;
        project.session = session;
        if (startupFailed) throw new Error("LANGUAGE_STARTUP_FAILED");
        for (const document of project.documents.values()) await session.sync(document);
        this.status(id, "ready");
        return;
      } catch {
        await project.session?.stop();
        project.session = null;
        project.failures++;
      }
    }
    this.status(id, "disabled");
  }
  async #close(id: string): Promise<void> {
    const project = this.#projects.get(id);
    this.#projects.delete(id);
    await project?.session?.stop();
    this.status(id, "closed");
  }
  close(id: string): Promise<void> {
    return this.#serial(() => this.#close(id));
  }
  dispose(): Promise<void> {
    this.#disposed = true;
    return this.#serial(async () => {
      for (const id of this.#projects.keys()) await this.#close(id);
    });
  }
}
