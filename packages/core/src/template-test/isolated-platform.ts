import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";

/** 工具发现沿用宿主能力，所有子进程的可写主目录、状态和运行标记改成本次测试所有。 */
export function isolatedPlatform(
  original: Platform,
  home: AbsPath,
  markerPrefix: string,
  signal: AbortSignal | undefined,
  onMarker: (marker: string) => void,
): Platform {
  return {
    ...original,
    exec: {
      ...original.exec,
      spawn: (spec) => {
        if (signal?.aborted) throw new Error("template test cancelled");
        const candidate = spec.env.RUNYARD_RUN_ID;
        const marker = candidate?.startsWith(`${markerPrefix}-`)
          ? candidate
          : `${markerPrefix}-aux`;
        onMarker(marker);
        return original.exec.spawn({ ...spec, env: { ...spec.env, RUNYARD_RUN_ID: marker } });
      },
    },
    paths: {
      ...original.paths,
      home,
      stateDir: joinPath(home, posixRelPath(".runyard")),
      defaultLibrary: joinPath(home, posixRelPath("Runyard")),
    },
    env: {
      ...original.env,
      load: async (options) => {
        const loaded = await original.env.load(options);
        return {
          ...loaded,
          env: {
            ...loaded.env,
            HOME: home,
            XDG_CACHE_HOME: joinPath(home, posixRelPath(".cache")),
          },
        };
      },
    },
  };
}
