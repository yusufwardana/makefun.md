# Design system for Make.fun Command Center

## 1. Visual theme and atmosphere

Design a dark-first workspace for a make.fun bounty operator. The page should answer three questions at a glance. What can I enter, what needs attention, and when was the data last checked? Give the first answer the most space and put account activity in a narrower column.

Draw on AppDashboard’s compact workspace header, grouped side navigation, and wide main panel paired with a narrow activity panel. Give this dashboard its own composition built around bounty deadlines, official submission checks, and the Muse handoff. Use the existing product navigation and real make.fun data. [AppDashboard demo by BootstrapMade](https://bootstrapmade.com/demo/AppDashboard/)

Set density to **7/10** for Overview and Explorer, **8/10** for Evidence Monitor and Submissions, and **5/10** for Settings. Use variance **5/10** on Overview and **3/10** elsewhere. Use motion **2/10**. Start Stitch previews in dark mode. Respect the operator’s saved theme in the app.

## 2. Color palette and roles

Use cool slate neutrals with one muted steel-blue accent. The accent should steer attention to a primary action, selected navigation, or the main chart series. Use text labels for all statuses.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| Deep slate canvas | `#101720` | `#F2F5F8` | Page background |
| Navigation slate | `#151E29` | `#EAF0F5` | Sidebar and header |
| Panel slate | `#1B2633` | `#FFFFFF` | Panels and input fields |
| Quiet slate | `#243344` | `#E8EFF5` | Hover, filters, and inset regions |
| Primary ink | `#F1F5F9` | `#182432` | Headings and values |
| Secondary ink | `#D2DCE6` | `#3C4E61` | Body and control text |
| Muted ink | `#A7B7C8` | `#516377` | Source labels and timestamps |
| Structural divider | `#35465A` | `#D9E2EC` | Borders between panels and rows |
| Control boundary | `#788EA4` | `#6E8296` | Form and outline button borders |
| Steel-blue accent | `#8CB4E0` | `#305B85` | Primary actions, focus, selected labels |
| Pressed steel blue | `#A4C5EA` | `#264B70` | Primary button hover and press |
| On accent | `#15273A` | `#FFFFFF` | Text and icons on filled buttons |
| Selected surface | `#263E57` | `#E0EBF6` | Active navigation and selected rows |

Reserve green `#85C8A7` / `#176144`, amber `#EFBD83` / `#835114`, and red `#FFA2AC` / `#A02D3C` for status text only. Use a 2 px focus ring with a 3 px offset. Aim for a minimum 4.5:1 text contrast and 3:1 for interactive borders. In charts, pair the accent with neutral comparison marks, axis labels, and exact values.

## 3. Typography rules

- Use **Geist** for headings, labels, and body text. Use **Geist Mono** for prize amounts, ranks, times, IDs, hashes, and metric values. At density 8, set every numeric field in monospace with tabular figures.
- Use `clamp(1.75rem, 3vw, 2.625rem)` for the Overview title, weight 650, line height 1.12, tracking `-0.035em`. Use `clamp(1.5rem, 2vw, 2rem)` for other page titles. Set panel headings at 16–18 px and weight 600.
- Use 16 px for body text, line height 1.5, with prose limited to `65ch`. Use 14 px for navigation, filters, and secondary copy. Use 13 px for timestamps and non-interactive metadata. Let long IDs and check codes wrap inside their column.
- Use sentence case and plain action labels. Keep official prompt text and check IDs verbatim. Group code and long briefs in their own reading areas so their formatting stays intact.

## 4. Component styling and states

| Component | Treatment |
| --- | --- |
| Workspace header | A 60 px bar with product name, bounded search, handle, and theme control. Use a quiet border at the bottom. Keep the search visible in the page on mobile. |
| Sidebar | A 224 px rail grouped into Workspace, Tracking, and Configuration. Use a 44 px navigation target, a restrained selected fill, and a 2 px accent leading edge. |
| Primary and secondary buttons | Use a 9 px radius and 44 px minimum target. Fill the primary action with steel blue. Use a surface fill or outline for secondary actions. Press feedback moves the control down by 1 px. |
| Metric strip | Use two or three labeled values inside one shared surface, divided by hairlines. Show the count of open bounties, the current prize pool, and a sync timestamp when available. Keep unavailable metrics clearly labeled. |
| Panels and rows | Use 12 px panel corners and a 1 px divider. Use section lines for repeated records. Reserve a low shadow `0 8px 24px rgba(16, 23, 32, 0.16)` for the mobile drawer and menus. |
| Search, filters, and key fields | Keep labels above controls and inline errors below. Use 44 px inputs with 12 px horizontal padding. Let filters wrap in natural reading order and mask credential fields. |
| Loading and empty states | Size skeleton rows to match the data they replace. Explain the next action in a single sentence when data is unavailable, such as connecting make.fun before checking recordings. |
| Sync and stale states | Pair the latest successful timestamp with a source and a plain state label. Keep existing rows readable when a refresh fails. Show the error beside the sync action or affected results. |

## 5. Layout principles and screen instructions

Use an 8 px spacing grid and a main content width capped at 1320 px. Set desktop gutters to 28 px, tablet gutters to 20 px, and mobile gutters to 16 px. Use CSS Grid with `minmax(0, ...)` for text-bearing columns. Target 16 px between controls, 20 px between related panels, and 28 px between major sections.

| Screen | Composition |
| --- | --- |
| **Overview** | Use a compact, left-aligned opening with **Search bounties** as the primary action. Add the metric strip below. Give **Open bounties** two-thirds of the working area and put **Watchlist** and **Last sync** information in the remaining third. Use no full-height landing hero. A small crop of a relevant, approved first-party product image may sit inline in the headline at `0.8em` height. Move that crop below the title on mobile. Keep the headline text-only when no suitable image exists. |
| **Bounty Explorer** | Use search and filters above a unified catalog. Align title, deadline, prize, and inspect action consistently. Move metadata beneath the title on mobile. Keep watchlist rank and refresh state near the tracked entries. |
| **Bounty Intelligence** | Give official requirements and the prompt the wider column. Keep **Export to Muse** in a compact utility column. Group JSON and Markdown downloads. Place **Enhance Skill** beside **Copy Muse Bootstrap Instructions** and show selected skill sources and rationale below. |
| **Evidence Monitor** | Put the bounty picker and **Sync make.fun** before official recordings. Show **Open** or **Sealed**, timestamps, and recording IDs. Place official evidence checks below and expand failures inline. Keep recording state separate from the platform’s submission check results. |
| **Submissions** | Use one expandable list keyed by entry ID. Put **Rejected** and **Superseded** in the status filter. Show stage, outcome, and source in the row. Open check details in place and put failures first. Use **Manual record** where applicable. |
| **Rewards Analytics** | Group official payout state and verified amounts above a compact comparison chart. Label amounts by their actual state. Put supporting rows below the chart. |
| **Settings** | Stack **Connect make.fun**, **Enhance AI**, and **Sync schedule** with a 640 px reading width. Give each form its own save action and result. Show the verified handle from make.fun when connected. |

Below **768 px**, collapse all content splits to one column in their original reading order. Open the sidebar in a full-height drawer sized with `100dvh`. Support Escape and restore focus to the opener. At 768–1023 px, retain one content column when the split would make controls wrap into more than two lines. Keep all touch targets at least **44 × 44 px**. Wrap long records and render expandable rows in place of any table that needs sideways scrolling. Verify the generated screens at 375, 579, 768, and 1440 px.

## 6. Motion and interaction

Use 120–180 ms transitions on hover, press, and overlay entry. Limit animation to opacity and transforms. Use spring stiffness 100 and damping 20 for the mobile drawer. When a view first appears, stagger the first four rows by 25 ms. Update filtered lists immediately after interaction.

Run a subtle 1.6 s skeleton shimmer during active loading for up to two cycles. Then show a static skeleton and a progress label until the request completes. Keep the idle dashboard still. Turn off shimmer, stagger, and spring travel under `prefers-reduced-motion` while keeping all controls and state feedback visible.

## 7. Anti-patterns

- Never use pure black, neon blue or purple glows, oversaturated accents, gradient headlines, or glossy button fills.
- Never use Inter, serif fonts, custom cursors, decorative emoji, or large blocks of uppercase labels.
- Never center the Overview opening, overlap text with imagery, or use three equal promotional cards in a row.
- Never import AppDashboard branding, placeholder profiles, sales data, billing screens, or demo-only widgets into this workspace.
- Never invent counts, show unsupported status badges, or substitute a promotional action for a working control.
- Never hide a key deadline, rejection reason, or payout status behind horizontal scrolling on mobile.
- Never give a local record, public snapshot, or official account response the same source label.
