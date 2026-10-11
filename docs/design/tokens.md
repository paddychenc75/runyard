# Runyard design tokens (single source for light and dark)

Every colour used in the design files, as a light/dark pair. When converting a
board from one theme to the other, map each value in the left column to the
value in the right column (or the reverse). Values not listed stay as they are.

## Surfaces

| Role | Light | Dark |
| --- | --- | --- |
| Window background (library, dialogs' backdrop) | #FFFFFF | #1C1C1E |
| Window background (workspace) | #F5F5F7 | #161618 |
| Content card (editor, panels, tables, settings cards) | #FFFFFF | #1E1E21 |
| Inset / field / code block background | #F5F5F7 | rgba(0,0,0,0.35) |
| Small neutral chip, badge tile | #F0F0F3 | rgba(255,255,255,0.10) |
| White raised tile (template badge, selected segment) | #FFFFFF | rgba(255,255,255,0.18) |
| Neutral fill button, segmented track | rgba(118,118,128,0.14) | rgba(118,118,128,0.24) |
| Scrim behind dialogs | rgba(20,22,30,0.22) | rgba(0,0,0,0.45) |

## Glass (floating layer only)

| Role | Light | Dark |
| --- | --- | --- |
| Toolbar / capsule background | rgba(255,255,255,0.66) | rgba(72,72,78,0.55) |
| Sidebar background (library) | rgba(242,243,247,0.78) | rgba(58,58,62,0.55) |
| File tree panel background | rgba(255,255,255,0.62) | rgba(58,58,62,0.55) |
| Dialog / menu background | rgba(250,250,252,0.82) to 0.86 | rgba(44,44,48,0.78) |
| Glass border | 1px solid rgba(255,255,255,0.9) | 1px solid rgba(255,255,255,0.14) |
| Glass shadow, toolbar | 0 0 0 0.5px rgba(0,0,0,0.08), 0 8px 24px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9) | 0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14) |
| Glass shadow, sidebar | 0 0 0 0.5px rgba(0,0,0,0.10), 0 12px 36px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,1) | 0 12px 36px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.12) |
| Glass shadow, dialog | 0 0 0 0.5px rgba(0,0,0,0.14), 0 40px 90px rgba(15,23,42,0.32), inset 0 1px 0 rgba(255,255,255,1) | 0 0 0 0.5px rgba(255,255,255,0.10), 0 40px 90px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.14) |
| Selected tab inside a glass capsule | #FFFFFF with shadow 0 1px 3px rgba(0,0,0,0.12) | rgba(255,255,255,0.16) with inset 0 1px 0 rgba(255,255,255,0.18) |
| Backdrop filter | blur(28px) saturate(180%); sidebar blur(40px); dialog blur(50px) saturate(190%) | same |

## Text

| Role | Light | Dark |
| --- | --- | --- |
| Primary | #1D1D1F | #F5F5F7 |
| Secondary strong | #3A3A3C | #D1D1D6 |
| Secondary | #6E6E73 | #A1A1A6 |
| Tertiary marks (non-text dots, unchecked borders) | #8E8E93 | #8E8E93 |
| Placeholder in fields | #6E6E73 | #A1A1A6 |
| On accent | #FFFFFF | #FFFFFF |

## Lines

| Role | Light | Dark |
| --- | --- | --- |
| Hairline between rows / card border | rgba(0,0,0,0.06) to 0.08 | rgba(255,255,255,0.08) |
| Stronger divider, input border | rgba(0,0,0,0.10) to 0.14 | rgba(255,255,255,0.14) |

## Accent and status

| Role | Light | Dark |
| --- | --- | --- |
| Accent fill (carries white text) | #0071E3 | #0071E3 |
| Accent line (focus ring, caret, non-text marks) | #0071E3 | #0A84FF |
| Accent text / link | #0058B0 (links #0071E3) | #4DA3FF |
| Accent tint (selected row, focus ring) | rgba(0,113,227,0.08) to 0.18 | rgba(10,132,255,0.20) |
| Running: dot | #28A745 | #30D158 |
| Running: text | #1B7A34 | #30D158 |
| Starting / warning: mark | #C27400 | #FFD60A |
| Starting / warning: text | #8A4B00 | #FFD60A |
| Warning tint background | rgba(194,116,0,0.08) | rgba(255,214,10,0.14) |
| Crashed / destructive: mark | #D70015 | #FF453A |
| Crashed / destructive: text | #C4001A | #FF9F99 |
| Destructive tint background | rgba(215,0,21,0.10) | rgba(255,69,58,0.18) |
| Agent: text | #7A2E9E | #D0A8FF |
| Agent: tint background | rgba(175,82,222,0.12) | rgba(191,90,242,0.24) |
| Switch on | #28A745 | #30D158 |

## Code syntax

| Token | Light | Dark |
| --- | --- | --- |
| Plain | #1D1D1F | #F5F5F7 |
| Keyword | #AD3DA4 | #FF7AB2 |
| String | #B3261E | #FF8170 |
| Function / property | #0F68A0 | #6BDFFF |
| Number | #1C00CF | #D9C97C |
| Tag name | #1B7A34 | #4EB0CC |
| Punctuation / muted | #6E6E73 | #A1A1A6 |
| Line number | #6E6E73 | #8E8E93 |
| Current line | rgba(0,113,227,0.07) | rgba(255,255,255,0.06) |

## File tree icons

| Kind | Light | Dark |
| --- | --- | --- |
| Folder | #B8860B | #FFD60A |
| TypeScript | #0F68A0 | #6BDFFF |
| CSS | #7A2E9E | #D0A8FF |
| HTML | #B3470B | #FFA14A |
| JSON / YAML | #8A6D00 | #FFD60A |
| Other | #6E6E73 | #A1A1A6 |
| Chevron | #6E6E73 | #A1A1A6 |
| Selected row icon | #FFFFFF | #FFFFFF |

## Shape, type and spacing (same in both themes)

- Radii: window: provided by the system, not drawn by the app (boards show 26 as an approximation), floating sidebar 20, content card 16, dialog 28, menu 16, list row / input 12, small control 8–9, capsule = half its height.
- Control heights: toolbar capsule 44, primary button 40–44, secondary button 32–36, segmented item 28, list row 44–54, tree row 28, menu item 32.
- Spacing scale: 2, 4, 6, 8, 10, 12, 16, 20, 24, 28. Window inset for floating panels 8. Gap between cards 8.
- Type: system font stack `-apple-system, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif`; mono `'SF Mono', Menlo, monospace`. Sizes: 28/700 page title, 20/700 dialog title, 16/600 section title, 14/600 item name and primary button, 13/400 body, 12 secondary and column headers, mono 12–13.
- Preview panes show the user's own web page: that page keeps its own colours (white page) in both themes.
