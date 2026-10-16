import type { FixtureModule } from "../src/index.ts";
import * as button from "../src/primitives/Button/Button.fixture.tsx";
import * as glassSurface from "../src/primitives/GlassSurface/GlassSurface.fixture.tsx";
import * as icon from "../src/primitives/Icon/Icon.fixture.tsx";

// 工作台列出的组件。新增组件时在这里加一行；registry.test.ts 核对每个 *.fixture.tsx 都在这里
export const fixtures: readonly FixtureModule[] = [button, glassSurface, icon];
