import { expect, it } from "vitest";
import { resourceTarget } from "./resource-policy.ts";

const site = "http://127.0.0.1:7100/";
const assets = new Set(["/", "/main.js", "/editor/editor.js", "/editor/editor.css"]);

it("只允许本工作台资源和已构建的本地app资源，映射保留真实文件", () => {
  expect(resourceTarget(`${site}?scene=Main`, site, assets)).toBe(`${site}?scene=Main`);
  expect(resourceTarget(`${site}main.js`, site, assets)).toBe(`${site}main.js`);
  expect(resourceTarget("app://runyard/editor/editor.js", site, assets)).toBe(
    `${site}editor/editor.js`,
  );
});

it("拒绝目录穿越、编码路径、改变协议/host和未登记资源，不能只检查前缀", () => {
  for (const url of [
    "app://runyard/editor/../editor/editor.js",
    "app://runyard/editor/%2e%2e/editor/editor.js",
    "app://runyard/editor/%252e%252e/editor/editor.js",
    "app://runyard/editor\\editor.js",
    "app://runyard@evil/editor/editor.js",
    "app://runyard.evil/editor/editor.js",
    "https://runyard/editor/editor.js",
    "app://runyard/editor/missing.js",
    "app://runyard/editor/editor.js?redirect=https://evil",
    "app://runyard/main.js",
    "https://example.com/main.js",
    "http://127.0.0.1:7101/main.js",
    `${site}../main.js`,
    `${site}%2e%2e/main.js`,
    `${site}missing.js`,
  ])
    expect(resourceTarget(url, site, assets), url).toBeNull();
});
