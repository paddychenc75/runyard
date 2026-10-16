import type { FixtureModule } from "../src/index.ts";
import * as navList from "../src/patterns/NavList/NavList.fixture.tsx";
import * as tabStrip from "../src/patterns/TabStrip/TabStrip.fixture.tsx";
import * as titleBar from "../src/patterns/TitleBar/TitleBar.fixture.tsx";
import * as button from "../src/primitives/Button/Button.fixture.tsx";
import * as glassSurface from "../src/primitives/GlassSurface/GlassSurface.fixture.tsx";
import * as icon from "../src/primitives/Icon/Icon.fixture.tsx";
import * as iconButton from "../src/primitives/IconButton/IconButton.fixture.tsx";
import * as scrollArea from "../src/primitives/ScrollArea/ScrollArea.fixture.tsx";
import * as tooltip from "../src/primitives/Tooltip/Tooltip.fixture.tsx";
import * as userText from "../src/primitives/UserText/UserText.fixture.tsx";

// 工作台列出的组件。新增组件时在这里加一行；registry.test.ts 核对每个 *.fixture.tsx 都在这里
export const fixtures: readonly FixtureModule[] = [
  button,
  glassSurface,
  icon,
  iconButton,
  navList,
  scrollArea,
  tabStrip,
  titleBar,
  tooltip,
  userText,
];
