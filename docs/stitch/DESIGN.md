# Design system for Make.fun Command Center

## 1. Visual theme and atmosphere

Design an operator dashboard for discovering make.fun bounties, checking official rules, preparing a Muse handoff, and monitoring submissions. The overview should feel like a well-organized catalog. Evidence and settings should feel like tools designed for repeated use. Keep the current product vocabulary and navigation groups.

Use Travely’s clear search hierarchy, green action color, and generous spacing as the visual reference. Translate the travel search into a bounty search and the featured listings into a deadline-led bounty feed. Build the dashboard around genuine competition records and account data. Keep travel photography, booking forms, and promotional sections out of the interface. [Travely demo by BootstrapMade](https://bootstrapmade.com/content/demo/Travely/)

Use density **5/10** on Overview and Explorer and **7/10** in Evidence Monitor and Submissions. Use layout variance **6/10** on Overview and **3/10** on operational screens. Use motion **2/10** throughout. Generate light as the reference preview and define the matching dark theme. Honor the operator’s saved preference when implementing the design.

## 2. Color palette and roles

Use slate neutrals and a single softened evergreen accent. The dark theme uses the same accent family at a lighter value. Apply the accent to the primary action, focus indicator, selected navigation, and one highlighted chart series.

| Role | Light | Dark | Application |
| --- | --- | --- | --- |
| Slate canvas | `#F7F9FB` | `#10171E` | Page background |
| Raised slate surface | `#FFFFFF` | `#18212A` | Panels, drawers, fields |
| Quiet slate surface | `#EFF3F6` | `#202D37` | Filter bands and hover surfaces |
| Deep slate ink | `#18232D` | `#F0F4F7` | Headings, titles, primary values |
| Secondary slate ink | `#3F4F5D` | `#D0DAE2` | Descriptions and control text |
| Muted slate ink | `#526474` | `#A8B8C6` | Dates, sources, and metadata |
| Structural line | `#DCE4EA` | `#334451` | Section and row dividers |
| Control border | `#768897` | `#79909F` | Input and outline button edges |
| Evergreen accent | `#246449` | `#85BFA3` | Primary button and focus ring |
| Pressed evergreen | `#1D543D` | `#A0CDB6` | Button hover and press |
| On evergreen | `#FFFFFF` | `#10251A` | Foreground on accent fills |
| Evergreen selected wash | `#E7F2EB` | `#233D31` | Active navigation, selected rows |

Reserve amber `#854B13` / `#F2BD76` and red `#A32936` / `#FF9EA6` for warning and error text. Use evergreen for confirmed states. State labels such as **Failed**, **Sealed**, and **Stale snapshot** must remain legible without color. Meet WCAG AA contrast for text and form boundaries. Use a 2 px evergreen focus outline with a 3 px offset. Keep chart labels and values visible alongside the marks.

## 3. Typography rules

- **Display and interface** use Geist with system sans fallbacks. Set the Overview headline to `clamp(2rem, 4.4vw, 3.5rem)` with weight 650, line height 1.08, and tracking `-0.045em`. Set operational page headings to `clamp(1.625rem, 3vw, 2.25rem)` with line height 1.15 and tracking `-0.025em`.
- **Section headings** use 18–22 px at weight 600. List titles use 16 px at weight 600. Use 14 px medium-weight labels for controls.
- **Body copy** uses 16 px with a 1.5 line height and a maximum width of `65ch`. Use 14 px for secondary copy and 13 px for tertiary metadata. Keep 14 px as the minimum for interactive labels.
- **Numbers and identifiers** use Geist Mono for amounts, ranks, timestamps, entry IDs, hashes, and check IDs. Align comparable values with tabular numerals. Allow long IDs and paths to wrap within their own blocks.
- **Language** follows the existing product. Use a single page title and short labels that name the action or data. Preserve the original wording of official make.fun prompts and rules when displaying or exporting them.

## 4. Component styling and states

| Component | Design instruction |
| --- | --- |
| Primary button | Use an evergreen fill, 10 px radius, 44 px minimum target, and 16 px horizontal padding. Apply a 1 px downward press and a visible keyboard focus ring. Keep one primary action per panel. |
| Secondary button | Use a quiet surface or an outlined control with the same height and radius. Keep **Download JSON**, **Download Markdown**, and **Copy Muse Bootstrap Instructions** distinguishable by their labels. |
| Search and filters | Place the label above the search input. On Overview, join a 52 px search field and button in a clear group, aligned on the same baseline. Use 44 px filters and selects elsewhere. Place errors below the field. Wrap filters when space runs out. |
| Panels | Use 14 px corners, a 1 px structural line, and 16–24 px padding. Reserve the shadow `0 8px 24px rgba(24, 35, 45, 0.08)` for the discovery search panel or a raised overlay. Use divided rows for lists and repeated results. |
| Bounty row | Lead with the bounty title, then show category, deadline, and prize. Give the favorite toggle and Inspect action accessible labels. Let metadata wrap under the title on narrow screens. |
| Evidence or submission row | Use a native expandable row. Show the official stage and outcome in the summary, with reason codes and failure details inside. Preserve focus when opening and closing the row. Keep a visible **Manual record** label when the source is local. |
| Loading and empty states | Match skeletons to the expected row height. Use a short empty state with the relevant action, such as connecting the account or changing the filter. Keep placeholders distinct from official records. |
| Errors and stale data | Place an error next to the action or data it affects. Show the last successful sync alongside stale data when available. Keep the scope clear, such as **Recording sync failed** or **API key expired**. |

## 5. Layout principles and screen instructions

Use CSS Grid for the main layout. Constrain content to 1240 px, with 32 px desktop gutters, 24 px tablet gutters, and 16 px mobile gutters. Use an 8 px spacing grid and 24–40 px between sections. Keep the existing desktop navigation rail at roughly 216 px and a 56 px header. The header holds the product name, account context, and theme switch. The mobile menu opens in a keyboard-accessible drawer with Escape dismissal and focus restoration.

| Screen | Composition and hierarchy |
| --- | --- |
| **Overview** | Use a left-aligned 60/40 discovery split at wide widths. Place the headline and **Search bounties** on the left, with the latest sync and real bounty counts on the right. Lead the next section with open bounties, with the watchlist and prize summary alongside. Use one small inline crop in the headline only when a relevant, approved bounty image or first-party product capture is available. Set its height to `0.8em`, reserve its width, and place it below the headline at mobile widths. Use a text-only headline when no contextual image is available. |
| **Bounty Explorer** | Place search and filters first, followed by a divided catalog. Surface deadline and prize in consistent positions. Keep Watchlist available with its public leaderboard and sync state. Give comparison a clear entry and exit. |
| **Bounty Intelligence** | Use an 8/4 desktop split. Show the official brief and requirements in the main column. Keep **Export to Muse** in the utility column. Put **Enhance Skill** close to **Copy Muse Bootstrap Instructions** and show selected skill links and reasons together. Stack the handoff panel on narrow screens. |
| **Evidence Monitor** | Place the account sync and bounty picker above **Official recordings** and **Official evidence checks**. Show open or sealed state, dates, and recording IDs. Give failed checks the first position within expanded submission details. Use the official API’s status labels. |
| **Submissions** | Render one list keyed by entry ID with status filters. Show the make.fun stage and outcome for matched entries, and label manual records. Expand each entry inline so results stay readable without sideways scrolling. |
| **Rewards and Settings** | Distinguish amounts announced, awarded, and received through clear labels and one comparison chart. Group Settings by make.fun connection, Enhance AI, and sync schedule. Mask credentials and state whether each key is configured. |

Below **768 px**, stack every content split and preserve semantic reading order. Between 768 and 1023 px, retain the single-column layout whenever the selected screen needs extra reading width. At wide viewports use `minmax(0, 1fr)` for text-bearing grid columns. Keep touch targets at least **44 × 44 px**. Wrap metadata, filters, paths, and IDs. Validate layout at 375, 579, 768, and 1440 px. Use `100dvh` for full-height drawers, and keep Overview’s search area compact enough for the bounty feed to follow naturally.

## 6. Motion and interaction

Use 120–180 ms state transitions. Animate only opacity and transforms. For the mobile drawer or an expanding overlay, use a spring with stiffness 100 and damping 20. Keep list filtering, status changes, and keyboard focus immediate. Where a panel uses an entrance, stagger the first four rows by 25 ms once on navigation.

Allow a 1.8 s skeleton shimmer during an active request. After two cycles, use static skeletons and readable progress text if the request is still running. Keep settled controls and backgrounds still. With `prefers-reduced-motion`, disable stagger, springs, and shimmer while preserving the same information and focus behavior.

## 7. Anti-patterns

- Never use pure black, neon or purple glows, saturated gradients, gradient headlines, or custom cursors.
- Never use Inter or serif typography in this dashboard. Keep display and UI type in the same sans-serif family.
- Never center the Overview headline, overlap text with imagery, or arrange three equal promotional cards in a row.
- Never add destination photography, booking fields, autoplay video, testimonials, invented scores, decorative numbering, or filler badges.
- Never use generic calls to action or external links with unclear destinations. Use labels like **Inspect requirements**, **Sync make.fun**, and **Add manual record**.
- Never flatten official, public-snapshot, and manual sources into the same status label. Preserve availability, ownership, and freshness indicators using data the dashboard can verify.
