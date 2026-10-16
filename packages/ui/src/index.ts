// 包的唯一入口：别的包只从 @runyard/ui 导入，不伸进内部文件

export type {
  FixtureMeta,
  FixtureModule,
  FixtureSample,
  SampleData,
} from "./fixtures/fixture-types.ts";
export type { IconName } from "./icons/generated/icon-paths.ts";
export {
  DataTable,
  type DataTableColumn,
  type DataTableColumnWidth,
  type DataTableProps,
} from "./patterns/DataTable/index.ts";
export {
  NavList,
  type NavListItem,
  type NavListProps,
  type NavListSection,
} from "./patterns/NavList/index.ts";
export {
  type TabStatus,
  TabStrip,
  type TabStripItem,
  type TabStripProps,
} from "./patterns/TabStrip/index.ts";
export { TitleBar, type TitleBarControls, type TitleBarProps } from "./patterns/TitleBar/index.ts";
export { Badge, type BadgeProps, type BadgeVariant } from "./primitives/Badge/index.ts";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./primitives/Button/index.ts";
export { EmptyState, type EmptyStateProps } from "./primitives/EmptyState/index.ts";
export {
  type GlassMaterial,
  GlassSurface,
  type GlassSurfaceProps,
} from "./primitives/GlassSurface/index.ts";
export { Icon, type IconProps } from "./primitives/Icon/index.ts";
export {
  IconButton,
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from "./primitives/IconButton/index.ts";
export {
  MonogramTile,
  type MonogramTileProps,
  type MonogramTileSize,
} from "./primitives/MonogramTile/index.ts";
export {
  ScrollArea,
  type ScrollAreaOrientation,
  type ScrollAreaProps,
} from "./primitives/ScrollArea/index.ts";
export {
  StatusMark,
  type StatusMarkProps,
  type StatusMarkStatus,
} from "./primitives/StatusMark/index.ts";
export { Tooltip, type TooltipProps } from "./primitives/Tooltip/index.ts";
export { Truncate, type TruncateProps } from "./primitives/Truncate/index.ts";
export { UserText, type UserTextProps } from "./primitives/UserText/index.ts";
