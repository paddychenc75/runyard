import { useT } from "@runyard/i18n/react";
import { proxyUrlSchema, registryUrlSchema, type SettingsPatch } from "@runyard/protocol";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LocalNetwork } from "../../../shared/settings-bridge.ts";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { NetworkRow } from "./NetworkRow.tsx";
import { Segments } from "./Segments.tsx";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { SettingsGroup, SettingsRow } from "./SettingsGroup.tsx";

// 依赖与网络（规格 DESKTOP-SETTINGS-12 至 14）：包管理器、npm 镜像源、代理、本机服务不走代理。
// 镜像源和代理没单独指定时沿用本机配置（.npmrc），输入框里显示本机的值；清空就是恢复沿用。
export function DepsGroup({ bridge, api }: { bridge: DesktopBridge; api: SettingsApi }) {
  const t = useT();
  const { settings, update } = api;
  const [local, setLocal] = useState<LocalNetwork>({});
  useEffect(() => {
    let alive = true;
    void bridge.call("settings.localNetwork").then(
      (found) => alive && setLocal(found ?? {}),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [bridge]);
  if (settings === null) return null;
  const { network } = settings;
  const change = (patch: Partial<typeof network>) => {
    const next = { ...network, ...patch };
    // 清空的字段要从保存的对象里去掉，不是存成 undefined
    const clean: SettingsPatch["network"] = {
      noProxyLocal: next.noProxyLocal,
      ...(next.registry === undefined ? {} : { registry: next.registry }),
      ...(next.proxy === undefined ? {} : { proxy: next.proxy }),
    };
    update({ network: clean });
  };
  return (
    <SettingsGroup title={t("settings.deps.title")}>
      <SettingsRow title={t("settings.pm.title")} hint={t("settings.pm.hint")}>
        <Segments
          label={t("settings.pm.title")}
          value={settings.packageManager}
          onValueChange={(next) =>
            update({ packageManager: next === "pnpm" ? "pnpm" : next === "npm" ? "npm" : "auto" })
          }
          items={[
            { value: "auto", label: t("settings.pm.auto.label") },
            { value: "pnpm", label: t("settings.pm.pnpm.label") },
            { value: "npm", label: t("settings.pm.npm.label") },
          ]}
        />
      </SettingsRow>
      <NetworkRow
        title={t("settings.registry.title")}
        hint={t("settings.registry.hint")}
        inheritedHint={t("settings.registry.inherited.hint")}
        placeholder={t("settings.registry.example.placeholder")}
        invalidText={t("settings.registry.invalid.body")}
        value={network.registry}
        local={local.registry}
        isValid={(text) => registryUrlSchema.safeParse(text).success}
        onCommit={(registry) => change({ registry })}
      />
      <NetworkRow
        title={t("settings.proxy.title")}
        hint={t("settings.proxy.hint")}
        inheritedHint={t("settings.proxy.inherited.hint")}
        placeholder={t("settings.proxy.example.placeholder")}
        invalidText={t("settings.proxy.invalid.body")}
        value={network.proxy}
        local={local.proxy}
        isValid={(text) => proxyUrlSchema.safeParse(text).success}
        onCommit={(proxy) => change({ proxy })}
      />
      <SettingsRow title={t("settings.noProxyLocal.title")}>
        <SettingSwitch
          label={t("settings.noProxyLocal.title")}
          checked={network.noProxyLocal}
          onCheckedChange={(noProxyLocal) => change({ noProxyLocal })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
