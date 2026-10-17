// 快速打开每行前面的文件小图标：形状和颜色与文件树一致（设计变量 --color-tree-*）。
// 文件树在应用外壳层，功能模块不能导入它，所以这里按同一张表画一份。

const FILE_PATH =
  "M4 1.5h5l3.5 3.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5zM9 1.5V5h3.5";

const TONE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  json: "data",
  yaml: "data",
  yml: "data",
  toml: "data",
};

export function fileTone(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  return TONE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? "other";
}

export function FileGlyph({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className={className}
      data-tone={fileTone(name)}
    >
      <path d={FILE_PATH} />
    </svg>
  );
}
