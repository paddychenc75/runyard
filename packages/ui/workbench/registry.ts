import type { FixtureModule } from "../src/index.ts";
import * as confirmDialog from "../src/patterns/ConfirmDialog/ConfirmDialog.fixture.tsx";
import * as dataTable from "../src/patterns/DataTable/DataTable.fixture.tsx";
import * as navList from "../src/patterns/NavList/NavList.fixture.tsx";
import * as tabStrip from "../src/patterns/TabStrip/TabStrip.fixture.tsx";
import * as titleBar from "../src/patterns/TitleBar/TitleBar.fixture.tsx";
import * as alertDialog from "../src/primitives/AlertDialog/AlertDialog.fixture.tsx";
import * as badge from "../src/primitives/Badge/Badge.fixture.tsx";
import * as button from "../src/primitives/Button/Button.fixture.tsx";
import * as checkbox from "../src/primitives/Checkbox/Checkbox.fixture.tsx";
import * as emptyState from "../src/primitives/EmptyState/EmptyState.fixture.tsx";
import * as glassSurface from "../src/primitives/GlassSurface/GlassSurface.fixture.tsx";
import * as icon from "../src/primitives/Icon/Icon.fixture.tsx";
import * as iconButton from "../src/primitives/IconButton/IconButton.fixture.tsx";
import * as monogramTile from "../src/primitives/MonogramTile/MonogramTile.fixture.tsx";
import * as scrollArea from "../src/primitives/ScrollArea/ScrollArea.fixture.tsx";
import * as statusMark from "../src/primitives/StatusMark/StatusMark.fixture.tsx";
import * as tooltip from "../src/primitives/Tooltip/Tooltip.fixture.tsx";
import * as truncate from "../src/primitives/Truncate/Truncate.fixture.tsx";
import * as userText from "../src/primitives/UserText/UserText.fixture.tsx";

// 工作台列出的组件。新增组件时在这里加一行；registry.test.ts 核对每个 *.fixture.tsx 都在这里
export const fixtures: readonly FixtureModule[] = [
  alertDialog,
  badge,
  button,
  checkbox,
  confirmDialog,
  dataTable,
  emptyState,
  glassSurface,
  icon,
  iconButton,
  monogramTile,
  navList,
  scrollArea,
  statusMark,
  tabStrip,
  titleBar,
  tooltip,
  truncate,
  userText,
];
