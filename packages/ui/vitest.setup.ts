import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 没开 Vitest 的全局变量，Testing Library 就不会自己在每个测试后卸载组件，这里补上
afterEach(() => {
  cleanup();
});
