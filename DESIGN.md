---
name: Age of Exploration
description: A navigator's working chart — paper, ink, and brass for a voyage you can only estimate.
colors:
  ink: "#163532"
  ink-muted: "#62716b"
  paper: "#f8f4e8"
  paper-deep: "#eee6d2"
  paper-inset: "#fffdf7"
  desk: "#e9e5d8"
  sea: "#153f43"
  sea-deep: "#0d2b2f"
  teal: "#2f7875"
  gold: "#b98b3d"
  gold-lamp: "#e9bd68"
  gold-marker: "#f3c66f"
  rust: "#a64f35"
  focus-amber: "#f0b94f"
  chart-water: "#d8e6df"
  chart-water-edge: "#67857d"
  chart-grid: "#8ba69e"
  confidence-rumoured: "#7c6339"
  confidence-observed: "#286f6c"
  confidence-confirmed: "#245d42"
  confidence-disproved: "#8b3f30"
  warning-field: "#fff0e6"
  warning-ink: "#6e2e22"
  error-field: "#fff2e8"
  error-ink: "#792f20"
  border: "rgba(22, 53, 50, 0.18)"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.4rem, 5vw, 5.3rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2.15rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  readout:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.45rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.08rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  dense:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.32
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.73rem"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "0.16em"
  field-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.76rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  hairline: "3px"
  control: "6px"
  tab: "7px 7px 0 0"
  pill: "99px"
  seal: "50%"
spacing:
  hair: "0.35rem"
  tight: "0.55rem"
  snug: "0.7rem"
  base: "1rem"
  loose: "1.5rem"
  panel: "clamp(1.2rem, 3vw, 2rem)"
  room: "clamp(1.5rem, 4vw, 4rem)"
components:
  button-base:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.72rem 1rem"
  button-primary:
    backgroundColor: "{colors.sea}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0.72rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.sea}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.sea}"
    rounded: "{rounded.control}"
    padding: "0.72rem 1rem"
  button-dense:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.52rem 0.65rem"
    height: "42px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "{spacing.panel}"
  panel-inset:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    padding: "0.9rem"
  status-bar:
    backgroundColor: "{colors.sea-deep}"
    textColor: "#eef5f1"
    padding: "0.55rem 0.75rem"
  tab:
    backgroundColor: "#e1ddcf"
    textColor: "{colors.ink}"
    rounded: "{rounded.tab}"
    padding: "0.48rem 0.85rem"
    height: "38px"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.sea}"
    rounded: "{rounded.tab}"
    padding: "0.48rem 0.85rem"
    height: "38px"
  input:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.72rem 0.8rem"
  input-dense:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.48rem 0.5rem"
  confidence-chip:
    backgroundColor: "transparent"
    textColor: "{colors.confidence-observed}"
    padding: "0.18rem 0.42rem"
---

# Design System: Age of Exploration

## Overview

**Creative North Star: "The Navigator's Working Chart"**

The interface is the table in the chart room, not a dashboard about one. Everything on screen is something the crew drew, measured, or wrote down: a ruled sheet of aged paper, a track inked day by day, a hatched ellipse where the position is only guessed at, brass instruments laid across the top. The player is reading working documents produced by their own expedition, and those documents are allowed to be wrong.

That single idea resolves nearly every visual question. Uncertainty gets drawn, never smoothed away — dashes, hatching, and dotted rules are the system's most important marks. Certainty gets solid weight, and it is rationed. Warm paper carries everything the player reads at length; deep sea-teal carries the fixed bars that report the ship's condition, so the eye learns instantly which surfaces are documents and which are instruments.

The system runs at two densities, and both are the real system. The **document density** (Outfitting, After-action) breathes: large serif headings, generous panels, a scroll. The **cockpit density** (Expedition, Interrupt) fills exactly one viewport with no page scroll at all, panels sized in tenths of a rem so a decision never sits below the fold. Same palette, same materials, same voice — the cockpit simply tightens every measurement. A new screen must declare which density it belongs to before anything else is decided.

**Key Characteristics:**

- Aged paper on a warm desk, with deep sea-teal reserved for instrument bars and reports
- Serif headings and serif numerals; sans-serif for everything read in quantity
- Dashed, hatched, and dotted marks mean *estimated*; solid weight means *established*
- Two densities — document and cockpit — sharing one material world
- Hairline borders and tonal stacking do the structural work; shadows only lift what floats
- Uppercase micro-labels at heavy weight and wide tracking, used as index tabs on every block

## Colors

A warm, low-chroma world — aged paper and Atlantic water — with exactly two accents, each carrying a fixed meaning.

### Primary

- **Deep Sea** (`#153f43`): the working sea-teal. Fills instrument bars (the critical-status strip, compact store readouts), primary buttons, chart landmark symbols, and the solid actual-track line in finalized reports. It is the color of things the ship is certain about.
- **Sea Ink** (`#0d2b2f`): the darkest surface, one step below Deep Sea. Reserved for the fixed chrome that frames a session — the session briefing bar, the report hero, the footer. Signals "this is the frame, not the content."
- **Chart Teal** (`#2f7875`): the lighter working teal used for eyebrow labels, left-edge rules on panels and log entries, and the border of the uncertainty readout. It marks structure and annotation rather than surfaces.

### Secondary

- **Brass Divider** (`#b98b3d`): the drafting-instrument gold. It marks measured uncertainty and official chart work — the hatched uncertainty ellipse and its dashed outline, the projected-range callout's left rule, the wax seal, the top rule of the report hero, the underline on the selected tab. **Lamplight Gold** (`#e9bd68`) is its lit variant for text on dark sea surfaces, and **Marker Gold** (`#f3c66f`) fills the round markers on a revealed actual track.
- **Iron-Gall Rust** (`#a64f35`): period writing ink as it oxidizes. It marks what the crew wrote down and what went wrong — the dashed estimated track, the estimated-position ring, warning rules, error borders, and unavailable event choices. Its darker text forms are **Warning Ink** (`#6e2e22`) and **Error Ink** (`#792f20`) on their tinted fields.

### Neutral

- **Chart Ink** (`#163532`): body text and headings. A near-black with green in it, so nothing on screen is pure neutral.
- **Faded Ink** (`#62716b`): secondary text, captions, micro-labels, empty states, and unit annotations.
- **Working Paper** (`#f8f4e8`): the default panel surface. Every readable block sits on it.
- **Weathered Paper** (`#eee6d2`): the recessed tone for inset blocks — allocation summaries, stat tiles, purchase cards, table headers, the last-result readout.
- **Paper Highlight** (`#fffdf7`): the brightest surface, used only for fields the player types into and for resting buttons, so inputs read as freshly-primed paper.
- **Desk** (`#e9e5d8`): the surface under everything, carrying a soft radial highlight from the upper left and a `145deg` gradient to `#ddd8ca`.
- **Ruled Edge** (`rgba(22,53,50,0.18)`): the hairline that separates nearly everything. It does more structural work than any shadow in the system.

### Named Rules

**The Two-Accent Rule.** Brass Divider and Iron-Gall Rust are the only accents. Gold means *this is an estimate or an instrument reading*; rust means *this is written testimony, a warning, or an error*. Neither is decorative, and a third accent is not available — a new state gets expressed through tone, weight, or stroke pattern instead.

**The Revealed-Only-After Rule.** A solid track line with Marker Gold dots exists on exactly one surface: the finalized after-action chart. During a live expedition every route mark is dashed rust. Nothing in a running session may render true position in any color.

**The Confidence-Has-a-Border Rule.** Fact confidence is carried by border *style* on a transparent chip, not by fill: dashed for rumoured (`#7c6339`), double for observed (`#286f6c`), 2px solid for confirmed (`#245d42`), and struck-through text for disproved (`#8b3f30`). The chip never becomes a filled pill.

## Typography

**Display Font:** Georgia (with `"Times New Roman", serif`)
**Body Font:** Inter (with `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)

**Character:** A transitional serif carrying every heading and every consequential number, against a neutral UI sans for the dense operational text. The serif does the historical work; the sans keeps a five-column status strip legible at 0.62rem. No font file is bundled — the zero-network constraint means Georgia resolves natively on Windows and macOS while Inter falls back to the platform UI face (Segoe UI on the target machine), so the pairing must stay legible under that substitution.

### Hierarchy

- **Display** (Georgia, `clamp(2.4rem, 5vw, 5.3rem)`, line-height 0.98, tracking -0.02em): screen titles at document density. The cockpit reduces the same element to `clamp(1.45rem, 2vw, 1.8rem)` at line-height 1 rather than switching styles.
- **Headline** (Georgia, `clamp(1.5rem, 2.4vw, 2.15rem)`): panel titles — Chart room, Deck, Log, the current decision.
- **Title** (Georgia, `1.25rem`): sub-sections inside a panel.
- **Readout** (Georgia, `1.45rem`; `1.85rem` for the projected-range callout): numbers the player weighs. Stat tiles, store counts, and the range estimate are set in the serif at regular weight — the only place numerals get display treatment.
- **Body** (Inter, `1.08rem`, line-height 1.65, max 62ch): ledes and explanatory prose at document density.
- **Dense** (Inter, `0.72rem`, line-height 1.32): the cockpit's working text — chart guidance, event choice descriptions, last-result readouts, warnings. It drops to 0.68rem below 760px.
- **Label** (Inter, `0.73rem`, weight 850, tracking 0.16em, uppercase, Chart Teal): the eyebrow above every block. On dark sea surfaces it becomes Lamplight Gold at 0.65rem.
- **Field Label** (Inter, `0.76rem`, weight 700, tracking 0.08em, uppercase, Faded Ink): definition-list terms, table headers, and stat captions.

### Named Rules

**The Serif-Carries-Consequence Rule.** Georgia is for headings and for numbers the player makes decisions against. Ordinary interface numerals — day counts in a log gutter, quantities inside a field — stay in the sans. If a number would change what the player does next, it is set in the serif.

**The Eyebrow-Index Rule.** Every substantial block opens with an uppercase micro-label naming what it is ("Chart room", "Current decision", "Mission"). At cockpit density, where headings shrink toward each other, that label is the primary way the eye indexes the screen.

## Layout

The app shell is `100dvh` with `overflow: hidden` on `html`, `body`, and `#app`; a session-active shell scrolls nothing at all. Document-density screens scroll inside `.app-shell`; cockpit screens must fit.

**Document density** centers a `1420px` container (`1240px` for interrupts) with `clamp(1.5rem, 4vw, 4rem)` top padding and `clamp(1rem, 4vw, 3.5rem)` inline padding. Outfitting runs a two-column grid at `minmax(0, 1.45fr) / minmax(340px, 0.75fr)` — allocation on the left, inherited knowledge on the right — collapsing to one column at 1050px.

**Cockpit density** goes full-bleed: `max-width: none`, `height: 100dvh`, `padding: 0.5rem clamp(0.5rem, 1.1vw, 1rem)`. The Expedition screen is a three-row grid (`auto auto minmax(0, 1fr)`) — briefing bar, status strip, then a workspace splitting `minmax(300px, 335px)` of command rail against the remaining space for the chart, deck, or log. The Interrupt screen adds a fourth row for its header. Every panel in this mode sets `min-height: 0` and owns its own `overflow: auto` with `overscroll-behavior: contain`, so an internal scroll never leaks to the page.

**Rhythm.** Document density works in `0.7 / 1 / 1.5 / 2.2rem` steps with `clamp(1.2rem, 3vw, 2rem)` panel padding. Cockpit density works in `0.2 / 0.35 / 0.45 / 0.55 / 0.7rem` steps with `0.65–0.8rem` panel padding. The two scales never mix inside one screen.

**Breakpoints.** `1050px` and `700px` govern document density; `760px` is the cockpit's single reflow (workspace stacks to one column, the briefing bar drops to two, the status strip goes to four columns and stacks each cell). `430px` is a final type and padding reduction. Below 700px the wax seal is hidden rather than shrunk.

### Named Rules

**The No-Page-Scroll Rule.** Expedition and Interrupt fit one viewport at every supported size. Content that outgrows its box gets a bounded internal scroll, a `max-height`, or ellipsis — never a taller page. A decision the player must make is never below the fold.

**The Min-Zero Rule.** Every grid and flex child in the cockpit declares `min-width: 0` and `min-height: 0`. Without it a single long fact string blows out the column and breaks the fixed-viewport contract.

## Elevation & Depth

Depth is tonal first. The stack runs Desk → Working Paper → Weathered Paper for recessed insets, and Deep Sea → Sea Ink for instruments, with a hairline `rgba(22,53,50,0.18)` border separating adjacent surfaces. Left-edge rules — 3–6px in teal, gold, or rust — do most of the remaining structural work, standing in for the cards and shadows a conventional dashboard would reach for.

Shadows are for things that genuinely float above the desk, and the two densities carry different weights: document panels take the ambient `0 24px 60px rgba(29,45,42,0.13)`, while cockpit panels take the tighter `0 10px 28px rgba(29,45,42,0.1)` so a screen full of panels does not turn to mush. Scrolling regions inside the cockpit (deck and log panels) drop their shadow entirely. Buttons carry no resting shadow and gain `0 7px 18px rgba(22,53,50,0.12)` on hover.

### Shadow Vocabulary

- **Ambient panel** (`0 24px 60px rgba(29,45,42,0.13)`): document-density panels, save cards, report sections.
- **Cockpit panel** (`0 10px 28px rgba(29,45,42,0.1)`): command rail, chart shell, decision surfaces.
- **Instrument bar** (`0 7px 20px rgba(13,43,47,0.12)`): the session briefing bar over the workspace.
- **Button hover** (`0 7px 18px rgba(22,53,50,0.12)`): paired with a 1px lift.
- **Tab selection** (`inset 0 -3px #b98b3d`): an inset gold underline, not a shadow in the usual sense.
- **Seal ring** (`inset 0 0 0 6px #e9e5d8, inset 0 0 0 7px #b98b3d`): the double ring inside the wax seal.

### Named Rules

**The Nested-Panels-Don't-Both-Lift Rule.** A panel inside a panel loses its shadow and keeps its border. Only the outermost floating surface casts.

## Shapes

Near-square. Controls take a 6px radius, tabs 7px on their top corners only, keyboard hints 3px. Nothing else rounds: panels, status bars, stat tiles, purchase cards, confidence chips, and inset blocks all have square corners, which is what keeps the system reading as ruled paper rather than a card UI.

Two deliberate exceptions carry meaning. The hold meter is a full `99px` pill over a repeating 10% tick gradient, so it reads as a measuring gauge rather than a progress bar. The wax seal is a circle at `aspect-ratio: 1`, rotated -5deg, with a double inset ring — the one hand-placed object in the system.

The recurring silhouette is the **ruled block**: a rectangle with a hairline border and one thick colored edge, most often on the left. Teal marks working annotation (log entries, the last-result readout, event choices), gold marks estimates and official chart work (the range callout, the briefing bar, the next-expedition card), rust marks warnings and unavailable options. Chart geometry follows the same logic in stroke: `4 9` dashes for the estimated track, `10 5` for the uncertainty ellipse, `2 9` for the grid, 45° hatching inside the ellipse.

### Named Rules

**The Square-By-Default Rule.** If a shape is not a control the player clicks or types into, it has square corners. Radius is an affordance signal, not a style.

**The Dashed-Means-Doubtful Rule.** Any dashed or hatched edge in the system means uncertainty — an estimated route, an uncertainty ellipse, a rumoured fact, an unavailable choice. Never use a dashed border decoratively.

## Components

### Buttons

Tactile and confident — objects on the desk that respond when pressed.

- **Shape:** softly squared (6px radius), 1px `rgba(22,53,50,0.28)` border, weight 700.
- **Base:** Paper Highlight (`#fffdf7`) on Chart Ink, `0.72rem 1rem` padding.
- **Primary:** Deep Sea fill, white text, matching border. Used for the one action that advances the session.
- **Secondary:** transparent with a Deep Sea border and text.
- **Hover:** `translateY(-1px)`, background to pure white (primary keeps its fill), plus the button-hover shadow, over `0.16s ease`.
- **Disabled:** `opacity: 0.58`, `cursor: not-allowed`, with the reason stated in the `<small>` inside the button rather than a tooltip.
- **Sub-label:** a block `<small>` at weight 500 on its own line explains cost or consequence — the standard way this system labels a decision.
- **Cockpit variant:** `0.52rem 0.65rem` padding, `42px` min-height, 0.76rem text; the primary action spans the full control grid. Choice tiles are left-aligned at 66–88px min-height.

### Tabs

- **Style:** `#e1ddcf` resting, top corners rounded 7px, sitting on a hairline rule with no bottom border.
- **Selected:** Working Paper fill, Deep Sea text, `inset 0 -3px` Brass Divider underline, driven by `aria-selected="true"`.
- **Dense:** 38px min-height, dropping to 34px and flexing to equal widths below 430px.

### Panels / Containers

- **Corner style:** square.
- **Background:** Working Paper; Weathered Paper for recessed insets.
- **Border:** 1px Ruled Edge, frequently with a thick colored left rule (see Shapes).
- **Shadow:** per density (see Elevation).
- **Padding:** `clamp(1.2rem, 3vw, 2rem)` at document density, `0.65–0.8rem` in the cockpit.

### Inputs / Fields

- **Style:** Paper Highlight fill, 1px `#8b9993` border — deliberately darker than the panel hairline so fields read as editable — 6px radius, `0.72rem 0.8rem` padding (`0.48rem 0.5rem` dense).
- **Label:** weight 800, with the unit or hint in a Faded Ink `<span>` on the same line.
- **Error:** the message sits in a reserved `.field-error` slot at `#843725`, 0.8rem, so validation text appearing does not shift the layout.
- **Focus:** universal — a `4px` solid `#f0b94f` outline at `3px` offset on every interactive element. Never remove or narrow it.

### Status Instruments

The dark counterpart to the paper panels, and the system's signature pattern.

- **Session briefing** (Sea Ink, 4px gold left rule): mission, current milestone, date, day count, and autosave state in one bar above the workspace; active warnings wrap into a full-width row beneath a translucent white rule.
- **Critical status** (Deep Sea, five equal columns): uppercase label at 0.62rem baseline-aligned against a white 0.84rem value, each cell divided by `rgba(255,255,255,0.13)` and truncating with ellipsis. Below 760px each cell stacks label over value.
- **Interrupt status** (Sea Ink, seven columns, four when narrow): the same instrument treatment for the decision screen.

### The Chart

The system's centerpiece: an 800×500 `viewBox` SVG on a Chart Water field (`#d8e6df`) with an 18px-rounded rect and a `2 9` dashed grid.

- **Estimated track:** 4px rust, `4 9` dashes, round caps.
- **Estimated position:** `#fff7df` fill with a 4px rust ring.
- **Uncertainty ellipse:** 45° gold hatch fill at 0.45 opacity, 3px gold stroke, `10 5` dashes.
- **Landmarks:** Deep Sea fill with a `#f5d68d` stroke, keyboard-focusable, with visible labels.
- **Labels:** 13px weight 800 with `paint-order: stroke` and a 4px Chart Water halo so text stays legible over any mark.
- **Actual track** (report only): 5px solid Deep Sea with 4px Marker Gold circles.
- Every chart carries a `<title>`/`<desc>` pair and a visual legend describing each mark in words.

### Named Rules

**The Legend-Says-It-In-Words Rule.** Every chart mark that carries meaning appears in the legend as prose ("Estimated track, dotted"), and the SVG description states plainly that the ellipse is uncertainty, not a coastline. Color and stroke are never the only carrier of meaning.

## Do's and Don'ts

### Do:

- **Do** declare a screen's density first — document (scrolls, `clamp(1.5rem, 4vw, 4rem)` rhythm) or cockpit (`100dvh`, sub-rem rhythm) — and use only that scale within it.
- **Do** draw uncertainty as dashes, hatching, or a dotted rule, and reserve solid weight for what the crew has established.
- **Do** open every block with an uppercase eyebrow label naming what it is.
- **Do** set consequential numbers in Georgia at regular weight (`1.45rem` tiles, `1.85rem` for the range callout).
- **Do** structure with hairline borders and thick colored left rules before reaching for a shadow.
- **Do** put the reason an action is unavailable inside the disabled button's `<small>`, next to the control it explains.
- **Do** keep the `4px #f0b94f` focus outline at `3px` offset on every interactive element, including SVG chart symbols.
- **Do** set `min-width: 0` and `min-height: 0` on cockpit grid children, and give scrolling regions `overscroll-behavior: contain`.
- **Do** reserve the error slot under a field so validation messages never shift layout.

### Don't:

- **Don't** drift toward a generic SaaS dashboard: no rounded metric cards, no blue accents, no filled pill badges, no icon-plus-number tiles. Square corners, ruled edges, and the two-accent palette are what keep this from happening.
- **Don't** reach for retro-terminal shorthand — monospace body text, scanlines, phosphor green, ASCII rules. The world is paper and brass, not a CRT.
- **Don't** introduce a third accent color. Express a new state through tone, border weight, or stroke pattern.
- **Don't** render true position, a solid route line, or Marker Gold dots anywhere except the finalized after-action chart.
- **Don't** load a web font, remote image, or any external asset. Nothing may leave the machine, so the Georgia/Inter stack must degrade to platform faces gracefully.
- **Don't** let a cockpit screen grow a page scroll; bound the panel instead.
- **Don't** stack shadows — a panel inside a panel keeps its border and drops its cast.
- **Don't** use a dashed border decoratively; dashes mean doubt.
- **Don't** round anything that is not a control the player clicks or types into. The hold-meter pill and the wax seal are the only exceptions.
- **Don't** rely on color alone for a state. Confidence uses border style, chart marks are named in the legend, and warnings carry the word "Warning".
