import type { FixtureModule } from "../src/index.ts";
import * as confirmDialog from "../src/patterns/ConfirmDialog/ConfirmDialog.fixture.tsx";
import * as dataTable from "../src/patterns/DataTable/DataTable.fixture.tsx";
import * as listPicker from "../src/patterns/ListPicker/ListPicker.fixture.tsx";
import * as logView from "../src/patterns/LogView/LogView.fixture.tsx";
import * as navList from "../src/patterns/NavList/NavList.fixture.tsx";
import * as tabStrip from "../src/patterns/TabStrip/TabStrip.fixture.tsx";
import * as titleBar from "../src/patterns/TitleBar/TitleBar.fixture.tsx";
import * as alertDialog from "../src/primitives/AlertDialog/AlertDialog.fixture.tsx";
import * as badge from "../src/primitives/Badge/Badge.fixture.tsx";
import * as banner from "../src/primitives/Banner/Banner.fixture.tsx";
import * as button from "../src/primitives/Button/Button.fixture.tsx";
import * as checkbox from "../src/primitives/Checkbox/Checkbox.fixture.tsx";
import * as copyableCommand from "../src/primitives/CopyableCommand/CopyableCommand.fixture.tsx";
import * as dialog from "../src/primitives/Dialog/Dialog.fixture.tsx";
import * as emptyState from "../src/primitives/EmptyState/EmptyState.fixture.tsx";
import * as field from "../src/primitives/Field/Field.fixture.tsx";
import * as glassSurface from "../src/primitives/GlassSurface/GlassSurface.fixture.tsx";
import * as icon from "../src/primitives/Icon/Icon.fixture.tsx";
import * as iconButton from "../src/primitives/IconButton/IconButton.fixture.tsx";
import * as kbd from "../src/primitives/Kbd/Kbd.fixture.tsx";
import * as menu from "../src/primitives/Menu/Menu.fixture.tsx";
import * as monogramTile from "../src/primitives/MonogramTile/MonogramTile.fixture.tsx";
import * as scrollArea from "../src/primitives/ScrollArea/ScrollArea.fixture.tsx";
import * as searchField from "../src/primitives/SearchField/SearchField.fixture.tsx";
import * as segmentedControl from "../src/primitives/SegmentedControl/SegmentedControl.fixture.tsx";
import * as slidingIndicator from "../src/primitives/SlidingIndicator/SlidingIndicator.fixture.tsx";
import * as statusMark from "../src/primitives/StatusMark/StatusMark.fixture.tsx";
import * as stepList from "../src/primitives/StepList/StepList.fixture.tsx";
import * as switchControl from "../src/primitives/Switch/Switch.fixture.tsx";
import * as textField from "../src/primitives/TextField/TextField.fixture.tsx";
import * as tooltip from "../src/primitives/Tooltip/Tooltip.fixture.tsx";
import * as truncate from "../src/primitives/Truncate/Truncate.fixture.tsx";
import * as userText from "../src/primitives/UserText/UserText.fixture.tsx";

// 工作台列出的组件。新增组件时在这里加一行；registry.test.ts 核对每个 *.fixture.tsx 都在这里
export const fixtures: readonly FixtureModule[] = [
  alertDialog,
  badge,
  banner,
  button,
  checkbox,
  confirmDialog,
  copyableCommand,
  dataTable,
  dialog,
  field,
  emptyState,
  glassSurface,
  icon,
  iconButton,
  kbd,
  listPicker,
  menu,
  monogramTile,
  logView,
  navList,
  scrollArea,
  slidingIndicator,
  searchField,
  segmentedControl,
  statusMark,
  stepList,
  switchControl,
  tabStrip,
  textField,
  titleBar,
  tooltip,
  truncate,
  userText,
];
