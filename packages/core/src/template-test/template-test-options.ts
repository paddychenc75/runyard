import type { AbsPath, Platform } from "@runyard/platform";
import type { RunClock } from "../run/run-clock.ts";
import type { TemplateLocations } from "../templates/locate-template.ts";
export interface TemplateTestOptions {
  template: string;
  platform: Platform;
  clock: RunClock;
  locations: TemplateLocations;
  appVersion: string;
  workspace: { create(): Promise<AbsPath>; remove(path: AbsPath): Promise<void> };
  marker: string;
  signal?: AbortSignal;
  keepDir?: boolean;
  toolVersions?: Readonly<Record<string, string>>;
  toolPaths?: Readonly<Record<string, string>>;
}
