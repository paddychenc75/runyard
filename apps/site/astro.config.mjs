import { defineConfig } from "astro/config";

// GitHub Pages 的项目站：地址是 paddychenc75.github.io/runyard，所以 base 必须是 /runyard（#563）。
export default defineConfig({
  site: "https://paddychenc75.github.io",
  base: "/runyard",
  trailingSlash: "always",
  output: "static",
  devToolbar: { enabled: false },
  // 不联网：不装任何集成，不用远程字体和图片服务
  build: { inlineStylesheets: "auto" },
});
