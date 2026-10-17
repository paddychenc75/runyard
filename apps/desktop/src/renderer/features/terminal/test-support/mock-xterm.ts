import { FakeFitAddon, FakeSearchAddon, FakeTerminal, FakeWebLinksAddon } from "./fake-xterm.ts";

// vi.mock 的工厂：`vi.mock("@xterm/xterm", async () => (await import("./test-support/mock-xterm.ts")).xtermModule)`
export const xtermModule = { Terminal: FakeTerminal };
export const fitModule = { FitAddon: FakeFitAddon };
export const searchModule = { SearchAddon: FakeSearchAddon };
export const webLinksModule = { WebLinksAddon: FakeWebLinksAddon };
