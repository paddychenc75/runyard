# Runyard

English | [简体中文](README.zh-CN.md)

Runyard is a desktop app for keeping and running code demos: pick a template, get a running project with an editor, a live preview and a terminal, and let AI coding agents create and run projects through a command-line tool.

<!-- sec: status -->
## Status

Early development. Nothing is usable yet. The product requirements, the technical design and the UI design are done; the code is being built in the open from here.

- The first version supports macOS only. Windows support is planned for later (no date).
- Builds are not code-signed for now.

<!-- sec: first-open -->
## Opening the unsigned app for the first time

The macOS build is neither signed nor notarized, so macOS blocks the first launch. Drag Runyard into Applications first, then open it, then go to System Settings > Privacy & Security and click "Open Anyway" (or run `xattr -dr com.apple.quarantine /Applications/Runyard.app`). The steps in full (in Chinese): [docs/guides/first-open-unsigned-app.md](docs/guides/first-open-unsigned-app.md).

<!-- sec: contents -->
## What is in this repository

| Path | Contents |
| --- | --- |
| `docs/product/` | Product requirements and technical design (in Chinese) |
| `docs/design/` | UI design sources, design tokens, and the app icon |
| `tooling/` | Repository tooling |

<!-- sec: network -->
## Network use

The only time the desktop app reaches out on its own is a once-a-day check of the public GitHub Releases API for a newer version (Settings: "Check for updates automatically", on by default). The request carries no cookies, tokens or device or user identifiers; if it fails nothing is shown; the app never downloads or installs anything itself (the "Download" button opens the release page in your browser). The command line never checks.

<!-- sec: language -->
## Language

The owner of this project works in Chinese, so code comments, commit messages and developer documents are written in Chinese. Identifiers, file names and commands are in English. Issues and pull requests in English are welcome.

<!-- sec: license -->
## License

[MIT](LICENSE)
