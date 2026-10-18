# Runyard design tokens (single source for light and dark)

Every colour used in the design files, as a light/dark pair. When converting a
board from one theme to the other, map each value in the left column to the
value in the right column (or the reverse). Values not listed stay as they are.

The tables below are generated from `packages/tokens/src/tokens.json` by
`pnpm tokens:build`; do not edit them by hand. Where a board and `tokens.json`
disagree, `tokens.json` wins.

<!-- generated:tokens 开始（由 pnpm tokens:build 生成，不要手改） -->

### Surfaces

| Role | Light | Dark |
| --- | --- | --- |
| Window background (library, dialogs' backdrop) (`--color-bg-window`) | #FFFFFF | #1C1C1E |
| Window background (workspace) (`--color-bg-workspace`) | #F5F5F7 | #161618 |
| Content card (editor, panels, tables, settings cards) (`--color-bg-card`) | #FFFFFF | #1E1E21 |
| Inset / field / code block background (`--color-bg-inset`) | #F5F5F7 | rgba(0, 0, 0, 0.35) |
| Text field and settings card inside a dialog (`--color-bg-field`) | #FFFFFF | rgba(0, 0, 0, 0.35) |
| Suggestion capsule and inline command chip (empty state) (`--color-bg-suggestion`) | #F5F5F7 | rgba(118, 118, 128, 0.24) |
| Small neutral chip, badge tile (`--color-bg-chip`) | #F0F0F3 | rgba(255, 255, 255, 0.1) |
| White raised tile (template badge, selected segment) (`--color-bg-raised`) | #FFFFFF | rgba(255, 255, 255, 0.18) |
| Neutral fill button, segmented track (`--color-fill-neutral`) | rgba(118, 118, 128, 0.14) | rgba(118, 118, 128, 0.24) |
| Scrim behind dialogs (`--color-scrim`) | rgba(20, 22, 30, 0.22) | rgba(0, 0, 0, 0.45) |

### Glass (floating layer only)

| Role | Light | Dark |
| --- | --- | --- |
| Toolbar / capsule background (`--glass-toolbar-bg`) | rgba(255, 255, 255, 0.66) | rgba(72, 72, 78, 0.55) |
| Sidebar background (library) (`--glass-sidebar-bg`) | rgba(240, 241, 245, 0.92) | rgba(44, 44, 48, 0.92) |
| File tree panel background (`--glass-filetree-bg`) | rgba(255, 255, 255, 0.72) | rgba(40, 40, 44, 0.92) |
| Dialog / menu background (`--glass-dialog-bg`) | rgba(250, 250, 252, 0.82) | rgba(44, 44, 48, 0.78) |
| Control on glass (secondary button), rest (`--glass-control-bg`) | rgba(255, 255, 255, 0.66) | rgba(72, 72, 78, 0.55) |
| Control on glass, hover (one more fill layer) (`--glass-control-bg-hover`) | rgba(255, 255, 255, 0.78) | rgba(72, 72, 78, 0.68) |
| Control on glass, pressed (`--glass-control-bg-pressed`) | rgba(255, 255, 255, 0.9) | rgba(72, 72, 78, 0.8) |
| Border of dialogs and menus (elevation 3 and 4 only; width: glass-border-width) (`--glass-border-color`) | rgba(255, 255, 255, 0.9) | rgba(255, 255, 255, 0.14) |
| Selected tab: a light fill only, no shadow or ring (`--glass-tab-selected-bg`) | rgba(0, 0, 0, 0.065) | rgba(255, 255, 255, 0.1) |

### Shadows

| Role | Light | Dark |
| --- | --- | --- |
| Elevation 0: inset blocks, table rows, inputs (no shadow) (`--shadow-flat`) | none | none |
| Elevation 1: content cards (no shadow, a 1 px hairline border instead) (`--shadow-card`) | none | none |
| Elevation 2: sidebar, file tree (fill plus one soft shadow, no edge, ring or top highlight) (`--shadow-floating`) | 0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.09) | 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 28px rgba(0, 0, 0, 0.42) |
| Elevation 4: dialogs, template picker (`--shadow-dialog`) | 0 0 0 0.5px rgba(0, 0, 0, 0.14), 0 40px 90px rgba(15, 23, 42, 0.32), inset 0 1px 0 rgba(255, 255, 255, 1) | 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 40px 90px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.14) |
| Elevation 3: menus, popovers, tooltips (`--shadow-overlay`) | 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 16px 40px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 1) | 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14) |
| Primary button glow (`--shadow-accent-button`) | 0 4px 14px rgba(0, 113, 227, 0.25) | 0 4px 14px rgba(10, 132, 255, 0.35) |
| Focus ring: 1.5 px accent line plus 3 px halo (`--shadow-focus-ring`) | 0 0 0 1.5px #0071E3, 0 0 0 4.5px rgba(0, 113, 227, 0.18) | 0 0 0 1.5px #0A84FF, 0 0 0 4.5px rgba(10, 132, 255, 0.32) |
| Text field focus halo (3 px, beside the 1.5 px accent border) (`--shadow-field-focus`) | 0 0 0 3px rgba(0, 113, 227, 0.18) | 0 0 0 3px rgba(10, 132, 255, 0.2) |
| Selected segment in a segmented control (`--shadow-segment-selected`) | 0 1px 3px rgba(0, 0, 0, 0.14), 0 0 0 0.5px rgba(0, 0, 0, 0.05) | none |
| Switch thumb (`--shadow-thumb`) | 0 1px 3px rgba(0, 0, 0, 0.25) | 0 1px 3px rgba(0, 0, 0, 0.25) |
| Template tile: a very faint top highlight (`--shadow-tile`) | inset 0 1px 0 rgba(255, 255, 255, 0.7) | inset 0 1px 0 rgba(255, 255, 255, 0.06) |

### Text

| Role | Light | Dark |
| --- | --- | --- |
| Primary (`--color-text-primary`) | #1D1D1F | #F5F5F7 |
| Secondary strong (`--color-text-secondary-strong`) | #3A3A3C | #D1D1D6 |
| Secondary (`--color-text-secondary`) | #6E6E73 | #A1A1A6 |
| Tertiary marks (non-text dots, unchecked borders) (`--color-text-tertiary`) | #8E8E93 | #8E8E93 |
| Placeholder in fields (`--color-text-placeholder`) | #6E6E73 | #A1A1A6 |
| On accent (`--color-text-on-accent`) | #FFFFFF | #FFFFFF |

### Lines

| Role | Light | Dark |
| --- | --- | --- |
| Hairline between rows / card border (`--color-line-hairline`) | rgba(0, 0, 0, 0.06) | rgba(255, 255, 255, 0.08) |
| Stronger divider, input border (`--color-line-strong`) | rgba(0, 0, 0, 0.1) | rgba(255, 255, 255, 0.14) |
| Text field border (`--color-line-field`) | rgba(0, 0, 0, 0.12) | rgba(255, 255, 255, 0.14) |
| Settings card border inside a dialog (`--color-line-card`) | rgba(0, 0, 0, 0.08) | rgba(255, 255, 255, 0.08) |

### Accent and status

| Role | Light | Dark |
| --- | --- | --- |
| Accent fill (carries white text) (`--color-fill-accent`) | #0071E3 | #0071E3 |
| Accent line (focus ring, caret, non-text marks) (`--color-line-accent`) | #0071E3 | #0A84FF |
| Accent text (`--color-text-accent`) | #0058B0 | #4DA3FF |
| Link (`--color-text-link`) | #0071E3 | #4DA3FF |
| Accent tint (selected row, focus ring) (`--color-fill-accent-tint`) | rgba(0, 113, 227, 0.08) | rgba(10, 132, 255, 0.32) |
| Running: dot (`--color-status-running-mark`) | #28A745 | #30D158 |
| Running: text (`--color-status-running-text`) | #1B7A34 | #30D158 |
| Starting / warning: mark (`--color-status-warning-mark`) | #C27400 | #FFD60A |
| Starting / warning: text (`--color-status-warning-text`) | #8A4B00 | #FFD60A |
| Warning tint background (`--color-fill-warning-tint`) | rgba(194, 116, 0, 0.08) | rgba(255, 214, 10, 0.14) |
| Terminal find: background of every match (`--color-fill-find-match`) | rgba(255, 214, 10, 0.45) | rgba(255, 214, 10, 0.3) |
| Terminal find: background of the current match (`--color-fill-find-active`) | rgba(255, 149, 0, 0.75) | rgba(255, 159, 10, 0.7) |
| Crashed / destructive: mark (`--color-status-danger-mark`) | #D70015 | #FF453A |
| Crashed / destructive: text (`--color-status-danger-text`) | #C4001A | #FF9F99 |
| Destructive tint background (`--color-fill-danger-tint`) | rgba(215, 0, 21, 0.1) | rgba(255, 69, 58, 0.18) |
| Destructive solid fill (confirm button of a destructive dialog) (`--color-fill-danger`) | #D70015 | #FF453A |
| Destructive solid fill, hover (`--color-fill-danger-hover`) | #C4001A | #F23C31 |
| Destructive solid fill, pressed (`--color-fill-danger-pressed`) | #A60017 | #E0352B |
| Accent fill, hover (`--color-fill-accent-hover`) | #0068D1 | #0979EB |
| Accent fill, pressed (`--color-fill-accent-pressed`) | #005FBF | #086FD6 |
| Neutral fill, hover (`--color-fill-neutral-hover`) | rgba(118, 118, 128, 0.22) | rgba(118, 118, 128, 0.32) |
| Neutral fill, pressed (`--color-fill-neutral-pressed`) | rgba(118, 118, 128, 0.3) | rgba(118, 118, 128, 0.4) |
| Destructive tint, hover (`--color-fill-danger-tint-hover`) | rgba(215, 0, 21, 0.16) | rgba(255, 69, 58, 0.26) |
| Destructive tint, pressed (`--color-fill-danger-tint-pressed`) | rgba(215, 0, 21, 0.22) | rgba(255, 69, 58, 0.34) |
| Agent: text (`--color-agent-text`) | #7A2E9E | #D0A8FF |
| Agent: tint background (`--color-fill-agent-tint`) | rgba(175, 82, 222, 0.12) | rgba(191, 90, 242, 0.24) |
| Switch on (`--color-fill-switch-on`) | #28A745 | #30D158 |
| Switch off track (`--color-fill-switch-off`) | rgba(120, 120, 128, 0.32) | rgba(120, 120, 128, 0.4) |

### Scrollbar

| Role | Light | Dark |
| --- | --- | --- |
| Scrollbar thumb at rest (primary text colour at 35%) (`--color-scrollbar-thumb`) | rgba(29, 29, 31, 0.35) | rgba(245, 245, 247, 0.35) |
| Scrollbar thumb on hover or drag (55%) (`--color-scrollbar-thumb-hover`) | rgba(29, 29, 31, 0.55) | rgba(245, 245, 247, 0.55) |

### Technology logos

| Role | Light | Dark |
| --- | --- | --- |
| HTML5 logo on a template tile (W3C orange; the lighter official orange in dark) (`--color-brand-html5`) | #E34C26 | #F06529 |
| Vue logo on a template tile (official navy in light, official green in dark) (`--color-brand-vue`) | #35495E | #4FC08D |
| Python logo on a template tile (official blue; the lighter official blue in dark) (`--color-brand-python`) | #3776AB | #4B8BBE |
| Python logo, second official colour (yellow) (`--color-brand-python-yellow`) | #FFD43B | #FFD43B |
| Letter colour of the React template tile (only borrows the hue) (`--color-brand-react`) | #087EA4 | #61DAFB |
| Letter colour of the Go template tile (`--color-brand-go`) | #007D9C | #00ADD8 |
| Letter colour of the Node + TypeScript template tile (`--color-brand-node`) | #417E38 | #5FA04E |
| Letter colour of the Hono template tile (`--color-brand-hono`) | #D14A00 | #FF8A3D |

### Code syntax

| Role | Light | Dark |
| --- | --- | --- |
| Plain (`--color-code-plain`) | #1D1D1F | #F5F5F7 |
| Keyword (`--color-code-keyword`) | #AD3DA4 | #FF7AB2 |
| String (`--color-code-string`) | #B3261E | #FF8170 |
| Function / property (`--color-code-function`) | #0F68A0 | #6BDFFF |
| Number (`--color-code-number`) | #1C00CF | #D9C97C |
| Tag name (`--color-code-tag`) | #1B7A34 | #4EB0CC |
| CSS property / HTML attribute / JSON key (`--color-code-property`) | #0F68A0 | #6BDFFF |
| Markdown heading (`--color-code-heading`) | #AD3DA4 | #FF7AB2 |
| Markdown bold / italic (`--color-code-emphasis`) | #0F68A0 | #6BDFFF |
| Markdown inline code / fenced code (`--color-code-raw`) | #B3261E | #FF8170 |
| Punctuation / muted (`--color-code-punctuation`) | #6E6E73 | #A1A1A6 |
| Line number (`--color-code-line-number`) | #6E6E73 | #8E8E93 |
| Current line (`--color-code-current-line`) | rgba(0, 113, 227, 0.07) | rgba(255, 255, 255, 0.06) |

### File tree icons

| Role | Light | Dark |
| --- | --- | --- |
| Folder (`--color-tree-folder`) | #B8860B | #FFD60A |
| TypeScript (`--color-tree-typescript`) | #0F68A0 | #6BDFFF |
| CSS (`--color-tree-css`) | #7A2E9E | #D0A8FF |
| HTML (`--color-tree-html`) | #B3470B | #FFA14A |
| JSON / YAML (`--color-tree-data`) | #8A6D00 | #FFD60A |
| Other (`--color-tree-other`) | #6E6E73 | #A1A1A6 |
| Chevron (`--color-tree-chevron`) | #6E6E73 | #A1A1A6 |
| Selected row icon (`--color-tree-selected-icon`) | #FFFFFF | #FFFFFF |

### Glass material (same in both themes)

| Variable | Value | Role |
| --- | --- | --- |
| `--glass-border-width` | 1px | Glass border width |
| `--glass-blur-toolbar` | blur(28px) saturate(180%) | Backdrop filter, toolbar / capsule |
| `--glass-blur-sidebar` | blur(40px) saturate(180%) | Backdrop filter, sidebar |
| `--glass-blur-dialog` | blur(50px) saturate(190%) | Backdrop filter, dialog |
| `--glass-blur-menu` | blur(40px) saturate(190%) | Backdrop filter, menu |

### Radii

| Variable | Value | Role |
| --- | --- | --- |
| `--radius-xs` | 6px | Tier xs: key caps, small tiles |
| `--radius-sm` | 9px | Tier sm: 28-32 px rows and controls, menu items, file tabs |
| `--radius-md` | 12px | Tier md: 40-54 px rows, fields, inset blocks |
| `--radius-lg` | 16px | Tier lg: content cards, menus, popovers |
| `--radius-xl` | 20px | Tier xl: floating panels at the window edge |
| `--radius-2xl` | 28px | Tier 2xl: dialogs |
| `--radius-sidebar` | 20px | Floating sidebar |
| `--radius-card` | 16px | Content card |
| `--radius-dialog` | 28px | Dialog |
| `--radius-menu` | 16px | Menu |
| `--radius-row` | 12px | List row / input |
| `--radius-control` | 9px | Small control |
| `--radius-checkbox` | 5px | Checkbox box |

### Capsule radius

| Variable | Value | Role |
| --- | --- | --- |
| `--radius-capsule` | 9999px | Capsule = half its height (any large value) |

### Control sizes

| Variable | Value | Role |
| --- | --- | --- |
| `--size-toolbar` | 44px | Toolbar capsule height |
| `--size-control-lg` | 40px | Primary button height |
| `--size-control-md` | 32px | Secondary button height |
| `--size-control-sm` | 28px | Segmented item, small control height |
| `--size-row` | 54px | List row height |
| `--size-control-padding-lg` | 18px | Primary button inline padding |
| `--size-control-padding-md` | 14px | Secondary button inline padding |
| `--size-tree-row` | 28px | File tree row height |
| `--size-menu-min` | 252px | Menu minimum width (RowMenu board: 252) |
| `--size-menu-item` | 32px | Menu item height |
| `--size-window-inset` | 8px | Window inset for floating panels |
| `--size-nav-item` | 36px | Sidebar navigation item height |
| `--size-tab` | 36px | Tab height in the top bar |
| `--size-tab-min` | 112px | Narrowest a project tab is squeezed to before tabs fold into +N |
| `--size-tab-label-max` | 180px | Widest a tab name gets before it is truncated |
| `--size-search-wide` | 240px | Library header search field, wide window |
| `--size-search-short` | 180px | Library header search field, narrow window |
| `--size-window-controls` | 72px | Space reserved for the native window buttons in a title bar |
| `--size-card-gap` | 8px | Gap between cards |
| `--size-dialog-width` | 580px | Dialog width |
| `--size-dialog-width-wide` | 720px | Width of the wide form dialog (save as template) |
| `--size-picker-width` | 860px | Width of the template picker (search, category rail, list) |
| `--size-picker-rail-width` | 190px | Width of the template picker's category rail |
| `--size-popover-width` | 420px | Width of the running-list popover |
| `--size-palette-width` | 680px | Width of the command palette and quick open |
| `--size-palette-top` | 66px | Distance from the window top to the command palette |
| `--size-palette-input` | 54px | Height of the command palette input row |
| `--size-palette-row` | 36px | Height of a command palette result row |
| `--size-palette-list-max` | 470px | Maximum height of the command palette result list |
| `--size-palette-footer` | 40px | Height of the command palette key-hint row |
| `--size-checkbox` | 18px | Checkbox box edge |
| `--size-switch-width` | 42px | Switch track width |
| `--size-switch-height` | 26px | Switch track height |
| `--size-switch-thumb` | 22px | Switch thumb diameter |
| `--size-dialog-icon` | 40px | Dialog icon block |
| `--size-status-mark` | 9px | Status dot / square in a list row |
| `--size-badge` | 22px | Badge (retention, creator) height |
| `--size-tile` | 22px | Template monogram tile, in a table row |
| `--size-tile-lg` | 24px | Template monogram tile, on a chip |
| `--size-scrollbar-thumb` | 6px | Scrollbar thumb thickness at rest |
| `--size-scrollbar-thumb-hover` | 10px | Scrollbar thumb thickness on hover or drag |
| `--size-scrollbar-hit` | 14px | Scrollbar hit area width |
| `--size-scrollbar-inset` | 2px | Scrollbar distance from the container edge |
| `--size-scrollbar-min` | 32px | Scrollbar thumb minimum length |
| `--size-column-icon` | 36px | Table column: row actions |
| `--size-column-sm` | 84px | Table column: port |
| `--size-column-md` | 96px | Table column: retention |
| `--size-column-lg` | 110px | Table column: last opened |
| `--size-column-xl` | 132px | Table column: status |
| `--size-column-xxl` | 144px | Table column: creator (agent badge plus its info button) |
| `--size-column-flex-min` | 140px | Table column that shares leftover width, minimum |
| `--size-column-fill-min` | 200px | Table name column, minimum |

### Spacing scale

| Variable | Value | Role |
| --- | --- | --- |
| `--space-1` | 2px | Spacing step 1 |
| `--space-2` | 4px | Spacing step 2 |
| `--space-3` | 6px | Spacing step 3 |
| `--space-4` | 8px | Spacing step 4 |
| `--space-5` | 10px | Spacing step 5 |
| `--space-6` | 12px | Spacing step 6 |
| `--space-7` | 16px | Spacing step 7 |
| `--space-8` | 20px | Spacing step 8 |
| `--space-9` | 24px | Spacing step 9 |
| `--space-10` | 28px | Spacing step 10 |

### Font stacks

| Variable | Value | Role |
| --- | --- | --- |
| `--font-sans` | -apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif | System font stack |
| `--font-mono` | "SF Mono", Menlo, monospace | Monospace stack |

### Type sizes

| Variable | Value | Role |
| --- | --- | --- |
| `--text-page-title-size` | 28px | Page title (weight 700) |
| `--text-dialog-title-size` | 20px | Dialog title (weight 700) |
| `--text-empty-title-size` | 24px | Empty state title (weight 700) |
| `--text-section-title-size` | 16px | Section title (weight 600) |
| `--text-item-size` | 14px | Item name and primary button (weight 600) |
| `--text-body-size` | 13px | Body (weight 400) |
| `--text-secondary-size` | 12px | Secondary and column headers |
| `--text-caption-size` | 11px | Key caps, small captions |
| `--text-micro-size` | 10px | Template tile letters, small tile |
| `--text-tile-large-size` | 17px | Template tile letters, large tile |
| `--text-code-size` | 13px | Code, ports, commands |
| `--text-code-small-size` | 12px | Small code |

### Type weights

| Variable | Value | Role |
| --- | --- | --- |
| `--text-page-title-weight` | 700 | Page title |
| `--text-dialog-title-weight` | 700 | Dialog title |
| `--text-section-title-weight` | 600 | Section title |
| `--text-item-weight` | 600 | Item name and primary button |
| `--text-control-weight` | 500 | Secondary and glass button label |
| `--text-body-weight` | 400 | Body |
| `--text-secondary-weight` | 400 | Secondary and column headers |
| `--text-caption-weight` | 400 | Key caps, small captions |
| `--text-micro-weight` | 600 | Template tile letters |
| `--text-code-weight` | 400 | Code |

### Type line heights

| Variable | Value | Role |
| --- | --- | --- |
| `--text-page-title-line-height` | 34px | Page title |
| `--text-dialog-title-line-height` | 26px | Dialog title |
| `--text-empty-title-line-height` | 30px | Empty state title |
| `--text-section-title-line-height` | 22px | Section title |
| `--text-item-line-height` | 20px | Item name and primary button |
| `--text-body-line-height` | 18px | Body |
| `--text-secondary-line-height` | 16px | Secondary and column headers |
| `--text-caption-line-height` | 14px | Key caps, small captions |
| `--text-micro-line-height` | 12px | Template tile letters |
| `--text-code-line-height` | 20px | Code |

### Motion durations

| Variable | Value | Role |
| --- | --- | --- |
| `--motion-duration-fast` | 120ms | Hover and press feedback |
| `--motion-duration-base` | 200ms | Colour and layout transitions |
| `--motion-duration-slide` | 250ms | Sliding selection background |
| `--motion-duration-crossfade` | 120ms | Selection crossfade when Reduce Motion is on |
| `--motion-duration-scrollbar-out` | 300ms | Scrollbar fade-out |
| `--motion-duration-scrollbar-idle` | 800ms | Scrollbar stays visible this long after the last scroll |
| `--motion-duration-spin` | 900ms | One turn of a loading spinner |
| `--motion-duration-popover` | 250ms | Floating layers growing from their trigger (about 0.25 s) |

### Motion easing

| Variable | Value | Role |
| --- | --- | --- |
| `--motion-easing-standard` | cubic-bezier(0.2, 0, 0, 1) | Default easing |
| `--motion-easing-slide` | cubic-bezier(0.32, 0.72, 0, 1) | Sliding selection: critically damped spring, no overshoot |
| `--motion-easing-popover` | cubic-bezier(0.34, 1.3, 0.64, 1) | Floating layers, with a slight bounce |

### Layers

| Variable | Value | Role |
| --- | --- | --- |
| `--z-base` | 0 | Normal content |
| `--z-slide-content` | 1 | Labels above a sliding selection background |
| `--z-sticky` | 10 | Sticky headers, toolbars |
| `--z-popover` | 100 | Menus, popovers |
| `--z-scrim` | 200 | Scrim behind dialogs |
| `--z-dialog` | 300 | Dialogs |
| `--z-toast` | 400 | Toasts |
| `--z-tooltip` | 500 | Tooltips |

<!-- generated:tokens 结束 -->

## Notes

- Window radius is provided by the system, not drawn by the app (boards show 26 as an approximation).
- Preview panes show the user's own web page: that page keeps its own colours (white page) in both themes.
