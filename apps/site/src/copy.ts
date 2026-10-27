export type Lang = "zh" | "en";

const repo = "https://github.com/paddychenc75/runyard";
export const links = {
  dmg: `${repo}/releases/download/v0.1.0/Runyard-0.1.0-mac-arm64.dmg`,
  releases: `${repo}/releases/latest`,
  repo,
  changelog: `${repo}/blob/main/CHANGELOG.md`,
  readme: `${repo}#readme`,
  unsigned: `${repo}/blob/main/docs/guides/first-open-unsigned-app.md`,
  issues: `${repo}/issues`,
};

export const unquarantine = "xattr -dr com.apple.quarantine /Applications/Runyard.app";

// 页面文字放在 src/copy/zh.json 和 en.json（内容数据，不是界面代码）；两份结构一致，改一边同步改另一边。
interface Feature {
  shot: string;
  alt: string;
  title: string;
  body: string;
}

export interface Copy {
  htmlLang: string;
  title: string;
  description: string;
  nav: { features: string; agents: string; download: string; github: string };
  switchLabel: string;
  eyebrow: string;
  h1: string;
  lead: string;
  cta: string;
  ctaSub: string;
  more: string;
  meta: string;
  metaLink: string;
  running: string;
  featuresTitle: string;
  featuresLead: string;
  features: Feature[];
  agentsTitle: string;
  agentsLead: string;
  termComment: string;
  termNote: string;
  points: { title: string; body: string }[];
  agentShotAlt: string;
  downloadTitle: string;
  downloadLead: string;
  version: string;
  platform: string;
  requires: string;
  dmgButton: string;
  allReleases: string;
  changelog: string;
  unsignedLead: string;
  unsignedSteps: string[];
  olderMac: string;
  terminalLead: string;
  copy: string;
  copied: string;
  everyUpdate: string;
  details: string;
  toolchain: string;
  footerTagline: string;
  product: string;
  resources: string;
  guide: string;
  unsignedLink: string;
  report: string;
  network: string;
  licence: string;
  followSystem: string;
}

import en from "./copy/en.json";
import zh from "./copy/zh.json";

export const copy: Record<Lang, Copy> = { zh, en };
