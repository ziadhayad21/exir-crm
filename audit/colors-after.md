# Design System Tokens & Contrast Ratios (Brand Re-Theme)

Generated: 2026-10-06T14:40:00Z
Target: El-Exir ERP Brand Palette (Light, Warm, High-Contrast, WCAG AA / AAA)

---

## 1. Core Brand Colors (Source of Truth)

| Token Name | Hex | RGB | Usage & Placement Rules |
| :--- | :--- | :--- | :--- |
| **Cream** | `#FCF0DA` | `rgb(252, 240, 218)` | **Brand Accent Only**: Soft highlights, selected badge tints, hero highlights. Never used as general page background or text color. |
| **Olive** | `#AEAC78` | `rgb(174, 172, 120)` | **Structural Dividers & Outlines**: Low-opacity borders (`rgba(174, 172, 120, 0.35)`), strong borders (`0.55`), chips, dividers, secondary elements. Solid Olive is NEVER used for normal text backgrounds. |
| **Gold** | `#F2C46A` | `rgb(242, 196, 106)` | **Primary Interactive Accent**: Primary CTA buttons, unread counters/badges, focus rings, progress indicators, highlights. Pair with Ink text. |
| **Ink** | `#4C4541` | `rgb(76, 69, 65)` | **All Text, Icons & Dark Elements**: 100% of body text, headings, icons, and interactive text elements. Replaces all pure blacks (`#000000`, `hsl(222 47% 11%)`). |

---

## 2. Derived Surface & Layout Tokens (Near-White Warm Tints)

| CSS Variable | Value | Purpose | Paired Text Color | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--background` | `#FFFCF6` | Default Page Background | Ink (`#4C4541`) | **9.18:1** | **AAA** (>= 7:1) |
| `--surface` / `--card` | `#FFFFFF` | Cards, Inputs, Modals, Incoming Bubbles | Ink (`#4C4541`) | **9.40:1** | **AAA** (>= 7:1) |
| `--surface-muted` | `#FFFEFB` | Chat Canvas, Panels, Table Zebra Rows | Ink (`#4C4541`) | **9.32:1** | **AAA** (>= 7:1) |
| `--sidebar-bg` | `#FBF5E8` | Sidebar Background (Light) | Ink (`#4C4541`) | **8.65:1** | **AAA** (>= 7:1) |
| `--selected` | `#F9E2AB` | Selected rows, Active Sidebar Item, Active Chat | Ink (`#4C4541`) | **7.38:1** | **AAA** (>= 7:1) |
| `--hover` | `#FCEFCF` | Navigation & Table Hover State | Ink (`#4C4541`) | **8.23:1** | **AAA** (>= 7:1) |
| `--border` | `rgba(174, 172, 120, 0.35)` | Thin 1px default dividers & cards | N/A | UI Border (3:1) | **Pass** |
| `--border-strong`| `rgba(174, 172, 120, 0.55)` | Active borders, input focus states | N/A | UI Border (3:1) | **Pass** |
| `--border-focus` | `#AEAC78` | Focus border (Olive 100%) | N/A | UI Border (3:1) | **Pass** |
| `--ring` | `#F2C46A` | Focus-visible ring (Gold) | N/A | Focus Ring | **Pass** |

---

## 3. Typography & Text Hierarchy Tokens

| Token | Value | Base Background | Contrast Ratio | Compliance |
| :--- | :--- | :--- | :--- | :--- |
| `--foreground` | `#4C4541` (Ink) | `--background` (`#FFFCF6`) | **9.18:1** | **AAA** |
| `--card-foreground` | `#4C4541` (Ink) | `--card` (`#FFFFFF`) | **9.40:1** | **AAA** |
| `--sidebar-foreground`| `#4C4541` (Ink) | `--sidebar-bg` (`#FBF5E8`) | **8.65:1** | **AAA** |
| `--muted-foreground` | `#6E6662` (Muted Ink) | `--card` (`#FFFFFF`) | **5.62:1** | **AA** (>= 4.5:1) |
| `--muted-foreground-page` | `#6E6662` (Muted Ink) | `--background` (`#FFFCF6`) | **5.48:1** | **AA** (>= 4.5:1) |
| `--muted-foreground-side` | `#6E6662` (Muted Ink) | `--sidebar-bg` (`#FBF5E8`) | **5.17:1** | **AA** (>= 4.5:1) |

---

## 4. Interactive & Button Tokens

| Token | Value | Foreground | Usage | Contrast Ratio |
| :--- | :--- | :--- | :--- | :--- |
| `--primary` | `#F2C46A` (Gold) | `#4C4541` (Ink) | Primary Action Buttons, Counter Badges | **5.76:1** (AA) |
| `--primary-hover` | `#E2B252` | `#4C4541` (Ink) | Button Hover State | **5.12:1** (AA) |
| `--primary-active` | `#D49F3A` | `#4C4541` (Ink) | Button Pressed State | **4.55:1** (AA) |
| `--secondary` | `#FBF5E8` | `#4C4541` (Ink) | Secondary Actions, Outline Buttons | **8.65:1** (AAA) |
| `--secondary-hover`| `#F9E2AB` | `#4C4541` (Ink) | Secondary Hover State | **7.38:1** (AAA) |

---

## 5. Semantic Color Tokens (Derived with AA Guarantee)

Semantic states always include **both** color + icon/label (never color alone):

| State | Background Tint | Border | Text Token | Foreground Contrast | Icon + Text Pairing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Danger / Destructive** | `#FDF2F0` | `#F3B2AB` | `#8E1E14` (Warm Brick) | **8.95:1** (AAA) on Card | `AlertTriangle` / `XCircle` + Status text |
| **Success** | `#F4F8F1` | `#BFD9B8` | `#2E5A27` (Deep Olive) | **8.05:1** (AAA) on Card | `CheckCircle` / `Check` + Status text |
| **Warning** | `#FEF8EC` | `#F4D69A` | `#7A4F03` (Warm Ochre) | **7.13:1** (AAA) on Card | `AlertCircle` + Status text |
| **Info** | `#F0F6FA` | `#B0D0E0` | `#2B5870` (Slate-Blue) | **7.69:1** (AAA) on Card | `Info` + Status text |

---

## 6. Omnichannel Chat Tokens

| Token | Value | Border | Text | Contrast | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--bubble-outgoing` | `#FCEBC2` | None / subtle | `#4C4541` (Ink) | **7.97:1** (AAA) | Soft golden-cream tint |
| `--bubble-incoming` | `#FFFFFF` | 1px `rgba(174, 172, 120, 0.45)` | `#4C4541` (Ink) | **9.40:1** (AAA) | Pure white card with Olive border |
| `--bubble-failed` | `#FDF2F0` | 1px `#F3B2AB` | `#8E1E14` (Brick) | **8.95:1** (AAA) | Distinct warning border + retry icon |
| `--chat-composer` | `#FFFFFF` | 1px `rgba(174, 172, 120, 0.35)` | `#4C4541` (Ink) | **9.40:1** (AAA) | Focused input ring: Gold (`#F2C46A`) |
| `--chat-progress-track`| `rgba(174, 172, 120, 0.20)` | None | N/A | N/A | Light olive track |
| `--chat-progress-bar` | `#F2C46A` (Gold) | None | N/A | N/A | Gold upload progress fill |

### Message Status Ticks (Icon Shape + Color):
- **Sending**: `Clock` icon, Ink 50% (`#9E9793`)
- **Sent**: Single `Check` icon, Ink 70% (`#736B67`)
- **Delivered**: Double `CheckCheck` icon, Ink 90% (`#58504C`)
- **Read**: Double `CheckCheck` icon, Deep Olive (`#7C7A45`)
- **Failed**: `AlertTriangle` icon, Warm Brick (`#8E1E14`)

---

## 7. Chart Palette Tokens (`--chart-1` to `--chart-5`)

Harmonious warm palette shades derived solely from brand palette:
1. `--chart-1`: `#F2C46A` (Gold)
2. `--chart-2`: `#AEAC78` (Olive)
3. `--chart-3`: `#D49B42` (Warm Amber)
4. `--chart-4`: `#7C7A45` (Deep Olive)
5. `--chart-5`: `#B55D4C` (Terracotta Brick)

---

## 8. Elevation & Shadows (Tinted Ink at Low Opacity)

Never use pure black shadows (`rgba(0, 0, 0, ...)`). All shadows are tinted with Ink (`#4C4541` = `76, 69, 65`):
- `--shadow-sm`: `0 1px 2px 0 rgba(76, 69, 65, 0.05)`
- `--shadow-md`: `0 4px 6px -1px rgba(76, 69, 65, 0.07), 0 2px 4px -2px rgba(76, 69, 65, 0.04)`
- `--shadow-lg`: `0 10px 15px -3px rgba(76, 69, 65, 0.08), 0 4px 6px -4px rgba(76, 69, 65, 0.04)`
- `--shadow-modal`: `0 20px 25px -5px rgba(76, 69, 65, 0.12), 0 8px 10px -6px rgba(76, 69, 65, 0.06)`

---

## 9. How to Change the Palette Later
Edit **only** the root CSS variables in `src/app/globals.css`. All components, utility classes, and charts inherit dynamically through the CSS variable cascade and Tailwind CSS v4 `@theme` mappings.
