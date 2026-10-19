import { createRequire, syncBuiltinESMExports } from "node:module";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

// 只在受限语言进程中预加载；权限模型负责文件/子进程，守卫补上网络和项目外监听。
const requireBuiltin = createRequire(__filename);
const deny = () => {
  throw new Error("LANGUAGE_NETWORK_DISABLED");
};
for (const name of ["net", "tls", "http", "https", "http2", "dgram"]) {
  const module = requireBuiltin(`node:${name}`);
  for (const key of [
    "connect",
    "createConnection",
    "request",
    "get",
    "createSocket",
    "createServer",
    "createSecureServer",
  ]) {
    if (key in module) module[key] = deny;
  }
  for (const key of ["Socket", "TLSSocket", "ClientRequest", "Server"]) {
    for (const method of ["connect", "listen", "send", "bind"]) {
      if (module[key]?.prototype?.[method]) module[key].prototype[method] = deny;
    }
  }
}
for (const name of ["dns", "dns/promises"]) {
  const module = requireBuiltin(`node:${name}`);
  for (const key of Object.keys(module)) {
    if (key.startsWith("resolve") || key === "lookup" || key === "lookupService")
      module[key] = deny;
  }
  if (module.Resolver) {
    for (const key of Object.getOwnPropertyNames(module.Resolver.prototype)) {
      if (key.startsWith("resolve") || key === "reverse") module.Resolver.prototype[key] = deny;
    }
  }
  if ("reverse" in module) module.reverse = deny;
}
globalThis.fetch = deny;
const fs = requireBuiltin("node:fs");
const root = process.cwd();
function inProject(value: unknown): boolean {
  try {
    const name =
      value instanceof URL
        ? fileURLToPath(value)
        : Buffer.isBuffer(value)
          ? value.toString()
          : value;
    if (typeof name !== "string") return false;
    const path = fs.realpathSync(name);
    const child = relative(root, path);
    return child === "" || (!child.startsWith("..") && !isAbsolute(child));
  } catch {
    return false;
  }
}
const { EventEmitter } = requireBuiltin("node:events");
for (const name of ["watch", "watchFile"]) {
  const original = fs[name];
  fs[name] = (path: unknown, ...args: unknown[]) => {
    if (inProject(path)) return original(path, ...args);
    const watcher = new EventEmitter();
    watcher.close = () => {};
    watcher.ref = () => watcher;
    watcher.unref = () => watcher;
    return watcher;
  };
}
const watchAsync = fs.promises.watch;
fs.promises.watch = (path: unknown, ...args: unknown[]) => {
  if (inProject(path)) return watchAsync(path, ...args);
  return (async function* () {})();
};
syncBuiltinESMExports();
