# Design system: COSMICLABS Make.fun Command Center

## 1. Visual direction

Treat the dashboard as a working catalog of bounties. The left-aligned search on Overview leads directly to Explorer. The adjacent account summary gives operators enough context to decide what to open next. The inspiration from [prompts.chat](https://prompts.chat/) is its readable catalog, slim navigation, prominent search and theme switch. Keep the Make.fun terminology, sidebar grouping, and evidence workflows.

Density 5/10. Variance 5/10. Motion 2/10. Use text, live records, and charts as the visual material.

## 2. Color roles

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#f8f9fb` | `#101216` |
| Surface | `#ffffff` | `#16191f` |
| Quiet surface | `#f1f3f7` | `#1e232d` |
| Hover surface | `#e9edf4` | `#262d39` |
| Text | `#1a202b` | `#f4f6fa` |
| Secondary text | `#3f4a5c` | `#d6deea` |
| Muted text | `#566376` | `#a6b3c7` |
| Border | `#dce2eb` | `#303846` |
| Control border | `#818da0` | `#768196` |
| Cobalt accent | `#3159a3` | `#a4c1ff` |
| Accent text | `#ffffff` | `#111d35` |
| Pressed accent | `#274780` | `#bdd2ff` |
| Selected surface | `#e8effd` | `#212f49` |
| Success | `#116344` | `#7edbb2` |
| Warning | `#854b13` | `#f2bd76` |
| Error | `#a32936` | `#ff9ea6` |

Use cobalt for the search action, navigation selection and focus. Green, amber and red signal data states. Dark is the default and the theme switch saves the reader's preference. Keep contrast on both themes.

## 3. Typography

Geist for headings and interface copy. Use Geist Mono for timestamps, source identifiers and tabular data. Overview's display line uses 34–58 px and tight tracking. Navigation uses 13 px and body copy 14–16 px. Keep explanatory copy near 65 characters per line. Use system sans and mono fallbacks while web fonts load.

## 4. Components

Buttons use 8 px corners, flat fills, an 180 ms color transition and a 1 px press. Keep focus rings visible. Cards have 12 px corners and a single border. Use dividers for operational lists. Put labels above grouped form inputs, with inline errors. Match skeleton sizes to the content and give empty states a specific action.

Search is a single identifiable control. The active navigation item has an indicator and a highlighted surface. Theme controls use an icon and an accessible name. The mobile navigation uses a modal drawer that supports Escape and restores focus.

## 5. Layout

Keep a thin sticky header and a grouped navigation rail on wide screens. Limit content to 1240 px with equal gutters of 16 px on mobile and 32 px on desktop. Overview pairs a search-led introduction with a compact summary. Open bounties are the primary list. Watchlist and prize pool appear alongside that list at desktop widths. Explorer uses catalog rows that wrap their metadata and controls. Stack the sections on narrow screens. Confine existing wide tables to labeled scrolling regions where their columns need room.

## 6. Motion

Use short transitions around hover, press and theme controls. Keep background motion stopped. Loading cues can animate while a network request is running. Honor reduced-motion settings.

## 7. Anti-patterns

Avoid gradient headlines, neon glows, fake terminals, unnamed badges, invented metrics, autoplay, decorative emojis, and pure black surfaces. Keep repository and bounty state based on real data.
