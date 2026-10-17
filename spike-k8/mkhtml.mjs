import { writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2];
const base = "default-src 'none'; script-src app://runyard; img-src data:";
const H = "'sha256-kLmvWqfziFavKtqHqRsb90f006UAK2Dmd0It5Iz2KFA='";
const variants = {
  index: [`${base}; style-src app://runyard ${H}`, "main.css", ""],          // v0 baseline = today's CSP
  v1: [`${base}; style-src app://runyard ${H}; worker-src app://runyard`, "main.css", ""],
  v2: [`${base}; style-src app://runyard ${H}; font-src app://runyard`, "main.css", ""],
  v3: [`${base}; style-src app://runyard 'unsafe-inline'; font-src app://runyard`, "main.css", ""],
  v4: [`${base}; style-src app://runyard 'unsafe-inline'; font-src data:`, "main-inline.css", ""],
  v5: [`${base}; style-src app://runyard 'nonce-k8nonce'; font-src app://runyard`, "main.css", `<meta name="k8-nonce" content="k8nonce" />`],
  v6: [`${base}; style-src app://runyard ${H}; style-src-elem app://runyard 'unsafe-inline'; font-src app://runyard`, "main.css", ""],
  v8: [`${base}; style-src app://runyard ${H}; style-src-elem app://runyard 'nonce-k8nonce'; style-src-attr 'unsafe-inline'; font-src app://runyard`, "main.css", `<meta name="k8-nonce" content="k8nonce" />`],
  v9: [`${base}; style-src app://runyard 'unsafe-inline' ${H}; font-src app://runyard`, "main.css", ""],
  zh: [`${base}; style-src app://runyard 'unsafe-inline'; font-src app://runyard`, "main.css", ""],
  v7: [`${base}; style-src app://runyard ${H}; style-src-elem app://runyard 'unsafe-inline'; font-src app://runyard; worker-src app://runyard`, "main.css", ""],
};
for (const [name, [csp, css, extra]] of Object.entries(variants)) {
  writeFileSync(join(out, `${name}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${csp}" />${extra}<title>${name}</title><link rel="stylesheet" href="app://runyard/${css}" /></head><body><div id="root"></div><script src="app://runyard/${name === 'zh' ? 'main-zh' : 'main'}.js"></script></body></html>\n`);
}
copyFileSync(join(process.argv[3], "main.css"), join(out, "main-inline.css"));
console.log(Object.keys(variants).join(" "));
