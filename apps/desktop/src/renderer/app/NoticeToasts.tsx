import { T, useFormat, useT } from "@runyard/i18n/react";
import { Button, GlassSurface, Icon, IconButton, UserText } from "@runyard/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import type {
  AgentRunNotice,
  AppNotice,
  LinkNotice,
  PathNearLimitNotice,
} from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./NoticeToasts.module.css";
import { useNow } from "./use-now.ts";

export interface NoticeToastsProps {
  bridge: DesktopBridge;
  notices: readonly AppNotice[];
}

// 窗口右下角的提示（设计稿 AgentActivity，规格 DESKTOP-LIBRARY-VIEW-54、55）：智能体经命令行创建并运行了项目，
// 或创建时路径接近系统上限。画在 body 下面的浮层层里（同菜单、对话框），自己占的那块矩形告诉外壳，
// 预览是原生视图会盖住它，所以与预览重叠时预览要让位。
// 它只是被画出来：不拿焦点（没有自动聚焦，也不用 alert 角色），不切标签页，不把窗口提到前面。
export function NoticeToasts({ bridge, notices }: NoticeToastsProps) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Bounds | null>(null);
  const count = notices.length;
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect();
    setRect(
      box === undefined ? null : { x: box.left, y: box.top, width: box.width, height: box.height },
    );
  }, [count]);
  useOverlay(count > 0 && rect !== null, rect ?? undefined);
  if (count === 0) return null;
  return createPortal(
    <section
      ref={root}
      className={styles.region}
      aria-label={t("desktop.notice.region.aria")}
      data-notice-region=""
    >
      {notices.map((notice) =>
        notice.kind === "agent-run" ? (
          <AgentRunToast key={notice.id} bridge={bridge} notice={notice} />
        ) : notice.kind === "link" ? (
          <LinkToast key={notice.id} bridge={bridge} notice={notice} />
        ) : (
          <PathToast key={notice.id} bridge={bridge} notice={notice} />
        ),
      )}
    </section>,
    document.body,
  );
}

function Dismiss({ bridge, id }: { bridge: DesktopBridge; id: string }) {
  const t = useT();
  return (
    <IconButton
      icon="close"
      size="sm"
      className={styles.close}
      label={t("desktop.notice.dismiss.aria")}
      onClick={() => void bridge.call("notice.dismiss", id)}
    />
  );
}

function AgentRunToast({ bridge, notice }: { bridge: DesktopBridge; notice: AgentRunNotice }) {
  const t = useT();
  const format = useFormat();
  const now = useNow(30_000);
  const done = () => bridge.call("notice.dismiss", notice.id);
  return (
    <GlassSurface material="toast" className={styles.toast} data-notice={notice.id}>
      <span aria-hidden="true" className={styles.tile} data-kind="agent">
        <Icon name="spark" size={18} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>
          {notice.agent === null ? (
            <T
              k="desktop.agentNotice.unnamed.label"
              values={{ name: notice.name }}
              components={{ user: <UserText /> }}
            />
          ) : (
            <T
              k="desktop.agentNotice.title.label"
              values={{ agent: notice.agent, name: notice.name }}
              components={{ user: <UserText /> }}
            />
          )}
        </p>
        {notice.url === null ? null : (
          <p className={styles.meta}>
            {t("desktop.agentNotice.meta.label", {
              url: notice.url,
              time: format.relativeTime(notice.at, now),
            })}
          </p>
        )}
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void bridge.call("tab.open", notice.playgroundId).then(done)}
          >
            {t("library.row.open.action")}
          </Button>
          <Button
            size="sm"
            onClick={() => void bridge.call("run.stop", notice.playgroundId).then(done)}
          >
            {t("desktop.stop.action")}
          </Button>
        </div>
      </div>
      <Dismiss bridge={bridge} id={notice.id} />
    </GlassSurface>
  );
}

function PathToast({ bridge, notice }: { bridge: DesktopBridge; notice: PathNearLimitNotice }) {
  const t = useT();
  return (
    <GlassSurface material="toast" className={styles.toast} data-notice={notice.id}>
      <span aria-hidden="true" className={styles.tile} data-kind="warning">
        <Icon name="warning" size={18} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>
          <T
            k="desktop.pathNotice.title.label"
            values={{ name: notice.name }}
            components={{ user: <UserText /> }}
          />
        </p>
        <p className={styles.meta}>
          {t("notice.PATH_NEAR_LIMIT", { length: notice.length, limit: notice.limit })}
        </p>
      </div>
      <Dismiss bridge={bridge} id={notice.id} />
    </GlassSurface>
  );
}

// 链接没能照做的提示（规格 DESKTOP-LINKS-03、04、10、11、14、16）：一句话，说明原因
function LinkToast({ bridge, notice }: { bridge: DesktopBridge; notice: LinkNotice }) {
  return (
    <GlassSurface material="toast" className={styles.toast} data-notice={notice.id}>
      <span aria-hidden="true" className={styles.tile} data-kind="warning">
        <Icon name="info" size={18} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>
          <LinkNoticeText notice={notice} />
        </p>
      </div>
      <Dismiss bridge={bridge} id={notice.id} />
    </GlassSurface>
  );
}

function LinkNoticeText({ notice }: { notice: LinkNotice }) {
  const values = { value: notice.value ?? "" };
  const components = { user: <UserText /> };
  switch (notice.code) {
    case "open-missing":
      return <T k="desktop.linkNotice.openMissing.label" values={values} components={components} />;
    case "new-no-template":
      return (
        <T k="desktop.linkNotice.newNoTemplate.label" values={values} components={components} />
      );
    case "new-name-invalid":
      return (
        <T k="desktop.linkNotice.newNameInvalid.label" values={values} components={components} />
      );
    case "new-name-taken":
      return (
        <T k="desktop.linkNotice.newNameTaken.label" values={values} components={components} />
      );
    case "new-failed":
      return <T k="desktop.linkNotice.newFailed.label" values={values} components={components} />;
    case "open-invalid":
      return <T k="desktop.linkNotice.openInvalid.label" />;
    case "new-busy":
      return <T k="desktop.linkNotice.newBusy.label" />;
    case "new-throttled":
      return <T k="desktop.linkNotice.newThrottled.label" />;
    case "link-invalid":
      return <T k="desktop.linkNotice.linkInvalid.label" />;
  }
}
