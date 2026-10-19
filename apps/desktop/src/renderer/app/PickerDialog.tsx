import { useT } from "@runyard/i18n/react";
import { GlassSurface, Kbd, ListPicker, SearchField, UserText } from "@runyard/ui";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryState } from "../../shared/library-state.ts";
import { defaultName } from "../create-view.ts";
import { buildPickerGroups, buildPickerRail, matchTemplates } from "../picker-view.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./PickerDialog.module.css";

export interface PickerDialogProps {
  library: LibraryState;
  /** 选好模板（回车或点击）：把模板标识交给下一步（新建弹窗，#173）；关闭由调用方做 */
  onPick: (templateId: string) => void;
  onClose: () => void;
}

// 模板选择器（设计稿 Picker）：搜索框里有焦点，列表按“最近使用”和类型分组，回车选择。
// 搜索按名称、标识、说明过滤（不分大小写）；搜索时没有“最近使用”，第一个结果自动高亮，回车进入新建弹窗。
// 打开期间焦点不离开搜索框（Tab 不跳走），Esc 关闭。
export function PickerDialog({ library, onPick, onClose }: PickerDialogProps) {
  const t = useT();
  // 预览是原生视图，会盖住网页里的浮层：打开期间告诉外壳，预览区据此换成截图
  useOverlay(true);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const [search, setSearch] = useState("");
  const searching = search.trim() !== "";
  const groups = useMemo(
    () =>
      buildPickerGroups(
        matchTemplates(library.templates, search, library.locale),
        library.recentTemplates,
        library.locale,
        {
          recent: t("desktop.picker.recent.label"),
          categories: {
            page: t("desktop.category.page.label"),
            frontend: t("desktop.category.frontend.label"),
            fullstack: t("desktop.category.fullstack.label"),
            script: t("desktop.category.script.label"),
            service: t("desktop.category.service.label"),
            mine: t("desktop.category.mine.label"),
          },
        },
        searching,
      ),
    [library, search, searching, t],
  );
  const rail = useMemo(
    () => ({
      label: t("desktop.picker.rail.aria"),
      items: buildPickerRail(groups, t("desktop.picker.all.label")),
    }),
    [groups, t],
  );
  const existing = useMemo(() => library.playgrounds.map((row) => row.name), [library]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: #172 Esc 和 Tab 在浮层根节点统一处理，根节点本身不是控件
    <div className={styles.scrim} onKeyDown={onKeyDown}>
      <GlassSurface
        material="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("desktop.picker.dialog.aria")}
        className={styles.dialog}
      >
        {groups.length === 0 ? (
          <p className={styles.empty}>
            {searching ? t("desktop.picker.noMatch.hint") : t("desktop.picker.empty.hint")}
          </p>
        ) : null}
        <ListPicker
          className={styles.picker}
          label={t("desktop.picker.list.aria")}
          groups={groups}
          rail={rail}
          onChoose={onPick}
          renderHeader={(props) => (
            <SearchField
              {...props}
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              label={t("desktop.picker.search.label")}
              placeholder={t("desktop.picker.search.placeholder")}
              trailing={<Kbd>{t("desktop.picker.escKey.label")}</Kbd>}
            />
          )}
          footer={(activeId) => (
            <>
              <Kbd>{t("desktop.picker.arrowsKey.label")}</Kbd>
              <span>{t("desktop.picker.move.hint")}</span>
              <Kbd>{t("desktop.picker.enterKey.label")}</Kbd>
              <span>{t("desktop.picker.next.hint")}</span>
              {activeId === undefined ? null : (
                <>
                  <span className={styles.spacer} />
                  <span>{t("desktop.picker.defaultName.label")}</span>
                  <span className={styles.defaultName} data-default-name="">
                    <UserText>{defaultName(activeId, existing)}</UserText>
                  </span>
                </>
              )}
            </>
          )}
        />
      </GlassSurface>
    </div>
  );
}
