// macOS 对“桌面”“文档”“下载”里的文件有隐私保护：第一次访问会弹系统的权限框（决策记录 0009）。
// 资源库选在这三个文件夹里时要先警告。这是系统的行为，所以写在 integration 目录。

const PROTECTED_NAMES = ["Desktop", "Documents", "Downloads"] as const;

function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** path 是否就是这三个文件夹之一，或在它们里面；home 是主目录 */
export function isInPrivacyProtectedFolder(home: string, path: string): boolean {
  const base = trimSlash(home);
  const target = trimSlash(path);
  return PROTECTED_NAMES.some((name) => {
    const folder = `${base}/${name}`;
    return target === folder || target.startsWith(`${folder}/`);
  });
}
