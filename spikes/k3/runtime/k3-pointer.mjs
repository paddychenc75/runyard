// 这次实验的“数据目录在哪”：正式产品里是固定的 ~/.runyard，实验绝不碰它，
// 所以用一个“指针文件”告诉打包后的应用和内置命令行去哪个临时目录。
// 为什么不用环境变量：从 Finder / open / 链接 / 安装器启动的应用拿不到测试程序的环境变量。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function pointerPath() {
  if (process.env.K3_POINTER) return process.env.K3_POINTER;
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "runyard-k3-spike", "pointer.json");
  return path.join(os.tmpdir(), "runyard-k3-spike-pointer.json");
}

// 返回 { root, cfgArgs, ... }；没有指针就返回 null（调用方必须拒绝运行，不许落到真实目录上）
export function readSpikeConfig() {
  try {
    const { root } = JSON.parse(fs.readFileSync(pointerPath(), "utf8"));
    return { root, ...JSON.parse(fs.readFileSync(path.join(root, "app-config.json"), "utf8")) };
  } catch {
    return null;
  }
}

// 这一份构建自己的版本和协议版本（打包时写进资源目录）
export function readBuildInfo() {
  return JSON.parse(fs.readFileSync(new URL("./build-info.json", import.meta.url), "utf8"));
}
