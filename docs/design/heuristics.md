# Oria Design Heuristics

The aesthetic floor for every interface decision. Read before opening any UI round. This doc plus the `@theme` tokens in `app/globals.css` are the design contract (there is no frontend-design skill; do not add shadcn/Radix/ui-ux-pro-max).

---

## 0. The North Star

Premium. Layered. Calm. Specific.

Oria reads like a high-end health/finance instrument, not a notes page. The
benchmark stack: WHOOP (data as dials, dark + considered), Linear (sharp,
deliberate), Things 3 (warm, human), Vercel (restraint). **Dark is the default
theme**; the warm off-white light theme is an explicit toggle. Both are
first-class and must look equally finished.

The source of truth for every value below is the `@theme` block of
`app/globals.css` and the reference mock `docs/design/home-target.html`. When a
value here and a token disagree, the token wins and this doc is updated.

Never: Stripe-dashboard cluttered. Never: Material-glossy. Never: gradient-vomit.
Never: emoji-laden. Never: AI-product-tropes (sparkle icons, "powered by" badges,
glowing borders). Never: a wall of words where a dial or number would say it.

---

## 1. The Heuristics

These hold across every screen, every component, every state.

1. **Restraint wins.** Every pixel earns its place. If you can remove it and the screen still works, remove it.

2. **Hierarchy through scale, not weight.** Bigger numbers, bigger type. Don't reach for bold to fix a layout. Reach for size.

3. **Tabular numerals on every number.** Use font-variant-numeric: tabular-nums. Numbers must align on update. No jitter.

4. **Eyebrows label every section.** Tiny uppercase letterspaced label above the section content (text-xs tracking-[0.18em] uppercase text-muted). Sets context. Replaces redundant H2s.

5. **Layered surfaces + one soft elevation.** The world is built from stacked
   surface tints (canvas < surface < surface-2 < surface-3), separated by
   hairline borders (border-line) and ONE soft shadow token (`--shadow`, the
   `shadow-soft`/`shadow-raised` aliases). Tiles read as gently lifted glass, not
   flat paper and not heavy Material cards. Glass (`.glass`) is still used for
   floating chrome (nav, command bar). No second, heavier shadow scale.

6. **Living background, slow.** Subtle warm-noise gradient on the canvas. Never animated faster than 30 seconds per cycle. Never on prefers-reduced-motion.

7. **One primary action per region.** A region is a card, a panel, a modal. One filled button. Secondary actions are ghost or text. No competing CTAs.

8. **44px minimum touch target.** Apple HIG floor. Applies to every clickable element on touch surfaces. Use padding to reach it, not visible button size.

9. **Tokens are the only source of truth.** Colors, spacing, radius, type sizes live in the `@theme` block of `app/globals.css`. No hex codes, no magic numbers in components. Period.

10. **Motion explains, never decorates.** Animation tells the user what just changed or what's about to. Layout shifts get crossfade. Insertions get height-grow. Removals get fade-out. Nothing else.

11. **Reduced motion is respected everywhere.** @media (prefers-reduced-motion: reduce) disables all motion above 80ms. Living background freezes. Page transitions become instant.

12. **Color carries meaning, never decoration.** Two themes, same roles. Every
    value is a token (`app/globals.css`); never inline a hex. The ONE brand
    accent is mint, and it means "Oria / primary action / the live thing", never
    a data value. Each data series owns one fixed hue, in both themes.

    | Role | Token | Dark | Light |
    |---|---|---|---|
    | Page | `--canvas` | `#08090B` | `#ECEAE4` |
    | Surface (tile) | `--surface` | `#15181C` | `#FFFFFF` |
    | Surface raised | `--surface-2` | `#1B1F24` | `#FBFAF7` |
    | Surface high | `--surface-3` | `#23282E` | `#F1F0EB` |
    | Hairline | `--line` / `--line-strong` | white .07 / .13 | ink .09 / .16 |
    | Text | `--ink` | `#F2F2F0` | `#14171B` |
    | Muted | `--ink-muted` | `#9CA1A8` | `#5C616A` |
    | Faint (captions) | `--ink-faint` | `#686D74` | `#90949C` |
    | Accent (mint) | `--brand` (`--accent-ink` on fill) | `#4FE3AC` | `#0E9E70` |
    | Recovery / up | `--rec` / `--up` | `#54D98C` | `#1AA559` |
    | Sleep | `--sleep` | `#8C8CFF` | `#5557E0` |
    | Strain | `--strain` | `#46CBE0` | `#0E9CB2` |
    | Spend | `--spend` | `#F2B441` | `#C5860F` |
    | Down / negative | `--down` | `#F2685C` | `#D8493C` |

    Each data hue has a `*-t` tinted companion (`--rec-t`, ...) for dial tracks
    and pill fills. Status semantics route through `lib/ui/status-color.ts`
    (good=rec, warn=spend, bad=down, info=brand), so one color never means two
    things. Per-context accents are earned, but the global accent stays mint.

13. **Type sets rhythm.**
    - Display (wordmark, greeting, section + briefing headlines): **Fraunces**
      (serif), weights 400/500/600, opsz axis on. Greeting ~27px, line-height
      ~1.1, letter-spacing -0.015em. `--font-display`.
    - Body, UI, and ALL numbers: **Hanken Grotesk**, weights 400/500/600/700.
      `--font-sans`. Body 15px line-height ~1.5.
    - Mono (code, IDs): JetBrains Mono. `--font-mono`.
    - **Tabular figures everywhere** (heuristic 3): `tnum` is on at the body
      level; the `.num` utility adds the design's -0.01em number tracking. Inter
      is removed; do not reintroduce it.

14. **Density toggle.** User picks Comfortable (default) or Compact in Settings. Stored in user_preferences.density. Components consult the token via a hook. No third option, no auto-detect.

15. **Both themes are first-class.** Dark is the default; light is a toggle
    (persisted via next-themes; per-space override via `OrgThemeApplier`). Every
    surface must be designed and checked in BOTH. Because everything is a token,
    this is mostly free, but verify contrast and that no value is hardcoded to
    one theme. Class model: dark = `:root` (and the `.dark` class next-themes
    adds); light = the `.light` class overriding the palette.

16. **Show data as visuals, not words** (see §4b). Prefer a dial, ring, bar row,
    sparkline, or a single big tabular number over a descriptive sentence. Words
    annotate the visual; they do not replace it.

---

## 2. Spacing system

Use the 4px scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. Nothing in between.

| Use | Comfortable | Compact |
|---|---|---|
| Card inner padding | 24 | 16 |
| Stack between cards | 16 | 12 |
| Inline gap (related items) | 8 | 6 |
| Page gutter | 32 | 24 |
| Section separator | 64 | 48 |

---

## 2b. Layout primitives (no hand-typed spacing)

Spacing is set through four primitives (`components/ui/layout.tsx`), never a
hand-typed `gap-*` / `p-*` / `space-y-*` in app code. Their only spacing input is
a token step on the 4/8pt scale (`Space` = 1·4px, 2·8px, 3·12px, 4·16px, 5·20px,
6·24px, 8·32px, 10·40px, 12·48px); an off-scale value is a TypeScript error.

- **Stack** — vertical rhythm: `<Stack gap={6}>`. Replaces `space-y-*` / flex-col.
- **Cluster** — a horizontal group that wraps: `<Cluster gap={2}>`. Centers by
  default; `justify` for spread.
- **Grid** — responsive columns: `<Grid gap={3} cols={2}>` (one per row on phones).
- **Inset** — a padding box: `<Inset pad={4}>` or split `x`/`y`.

Each accepts `as` (element) and a `className` for non-spacing concerns only.
Adopted on the Home (`app/dashboard/page.tsx`) and the Finance spend view; extend
to every new surface. Card-internal padding stays the `--radius`/token classes;
the primitives own the BETWEEN-element rhythm.

---

## 3. Border radius

- Buttons, inputs, small chips, icon tiles: 10-12px
- Stat tiles: 18px (`--radius-tile`, `rounded-tile`)
- Cards, hero containers (briefing, week): 20px (`--radius-card`, `rounded-card`)
- Pills, chips, dials track, avatars: 999px (fully round)
- Modals, sheets: 24px; phone/app icon (PWA): per §10

Avoid: anything below 8px (feels sharp). The tile/card pair (18/20) is the
house style; do not mix in 16px tiles.

---

## 4. Elevation

ONE soft shadow, layered surfaces, hairline borders. The aesthetic is lifted
glass, not paper and not Material.

- `--shadow` (aliased `shadow-soft` / `shadow-raised`) is the only card shadow:
  in dark it is a faint top inset + a deep, low-spread drop; in light a soft
  short drop. Tiles, the briefing, the week chart, and the Talk-to-Oria cube all
  carry it.
- `--shadow-xs` for tiny floating chrome (toggle thumb). `--shadow-lg`/`xl`
  reserved for modals/sheets/dropdowns.
- Depth otherwise comes from the surface ramp (canvas -> surface -> surface-2 ->
  surface-3) plus `--line` borders, not extra shadows.

Banned: a second heavy shadow scale, colored shadows (except the accent glow on
the accent cube/`+`), 3D skeuomorphism.

---

## 4b. Dials + data visualization (show data, not words)

Oria is a data product: a number or a dial almost always beats a sentence.

- **Dials** are the `ScoreRing` primitive (`components/ui/score-ring.tsx`):
  hand-rolled SVG arc, rounded linecap, a tinted track in the SAME hue as the
  arc (`*-t` token), value centered in tabular figures. Drive a named series
  with `colorVar`/`trackVar` from `DATA_VAR`/`DATA_TRACK`
  (`lib/ui/status-color.ts`): recovery=green, sleep=indigo, strain=cyan,
  spend=amber. A 0-100 score with no explicit color auto-tones (low=attention).
- **Rings vs bars vs sparklines:** a ring for a single 0-100 / budget-fraction
  value; a mini bar row for a week of one metric (today's bar in accent); a
  sparkline for a trend where the shape matters more than the axis.
- **Deltas** are pills: `↑`/`↓` + percent, `--up`/`--down` text on the tinted
  fill. Never a bare colored number.
- **No fabricated data.** A series with thin/empty data shows a calm empty state
  (heuristic: never invent a dial value). Reduced motion: dials render static.

---

## 5. Accessibility floor

**WCAG AA is the floor, not the ceiling.** axe-core runs in CI. Zero critical violations on every commit.

Specifics:
- Color contrast: 4.5:1 minimum for body text, 3:1 for large text (18px+)
- Focus rings: visible on every interactive element, never outline: none without replacement
- Focus ring style: 2px solid #0f0f0f, 2px offset, :focus-visible only
- Keyboard navigation: every flow completable without a mouse
- Tab order: matches visual order
- Screen reader labels: every icon button has aria-label, every input has a label
- Semantic HTML: button for buttons, a for links, never div onClick
- Form errors: associated with inputs via aria-describedby, announced via aria-live="polite"
- Page titles: descriptive and unique per route
- Skip-to-content link at the top of every page
- Live regions: aria-live="polite" for updates, aria-live="assertive" only for errors
- Reduced motion respected (see heuristic 11)
- Text resize to 200% must not break layout
- No content conveyed by color alone (use icon + label, never just a red dot)

Lighthouse accessibility score must be >= 95 on every page in CI.

---

## 6. Motion principles

Three categories of motion. Everything else is banned.

### A. Functional (explains state change)
- Card insertion: height 0 to auto, 240ms ease-out
- Card removal: opacity 1 to 0, 180ms ease-in
- Modal open: opacity + scale 0.96 to 1, 200ms ease-out
- Toast: slide-in 220ms, slide-out 180ms
- Layout shift: crossfade 160ms, never slide

### B. Acknowledgment (confirms action)
- Button press: scale 0.97, 120ms
- Suggestion swipe: follow finger, snap on threshold
- Undo countdown: linear progress bar, 60s

### C. Atmospheric (sets tone, rarely)
- Living background: 30-60s gradient drift, paused on reduced motion
- Hero number on Today: count-up animation on first load only, 600ms ease-out

### Banned
- Bounce easings (cute, ages badly)
- Parallax scrolling
- Auto-play video
- Pulsing badges
- Animated emoji
- Spring physics on UI elements (only on draggables)
- Anything triggered by hover that doesn't survive touch

Default easing: cubic-bezier(0.2, 0, 0, 1) (ease-out-quart). Never linear except for progress bars.

---

## 7. Component patterns

### Buttons
- Primary: filled ink, white text, 10px radius, 44px min height, 16px horizontal padding
- Secondary: ghost (transparent), ink border, ink text
- Tertiary: text only, ink underline on hover
- Destructive: oxblood, used sparingly, always with confirmation

### Inputs
- Single line: 10px radius, beige border, ink text, no inset shadow
- Focus: 2px ink ring, no background change
- Error: oxblood border + helper text below
- Multi-line: same but minimum 4 visible rows

### Cards
- Glass tile (default): bg-tile border border-tile-border rounded-2xl p-6
- Bordered (interactive): same plus hover:shadow-sm
- Hero (Today blocks): bigger radius (22px), bigger padding (32px)

### Empty states
- Eyebrow label
- Plain sentence explaining the state
- One action (button or link)
- No illustrations. No mascots. The void is the message.

### Loading states
- Skeleton blocks (matched to the shape of the content), not spinners
- Spinners only inside buttons during submit (16px, 2px stroke)
- Never block the whole screen unless a critical operation

### Toasts
- Top-center on desktop, bottom on mobile
- Auto-dismiss 4s for info, 6s for success, never for errors
- Errors get a manual dismiss + a "Retry" or "Reconnect" action
- Stack max 3, FIFO

### Modals
- Center on desktop, bottom-sheet on mobile (< 640px)
- Backdrop: rgba(15, 15, 15, 0.4) with backdrop-blur-sm
- Close on ESC, backdrop click, and visible X
- Focus trapped inside, returned to trigger on close

### Navigation
- Desktop: a SINGLE left rail (`components/dashboard/sidebar.tsx`), drag-to-resize
  width persisted. Logo, Today + Ask primary, Sections, mode nav, account.
- Mobile: a bottom tab bar (`components/dashboard/bottom-tab-bar.tsx`) with a
  center filled accent `+` for capture; More opens the rail as a drawer.

---

## 8. Visual states cheat sheet

Every interactive element supports: default, hover, focus-visible, active, disabled, loading.

Every data surface supports: default, empty, loading, error, partial (e.g., one connector down).

Build these from the start, not as afterthoughts.

---

## 9. Iconography

- Lucide icons only (single source, consistent stroke). Lucide is wired in
  `components/ui/icon`: every icon is a named export (`HomeIcon`, `SparkIcon`, ...)
  wrapping one Lucide glyph. Never import from `lucide-react` directly in a page,
  route, or component; go through `components/ui/icon` so sizing, stroke, and RTL
  stay centralized.
- Stroke width: 1.5px on small (16-20px), 2px on medium (24px), 2.5px on large (32px+). Applied automatically by the Icon wrapper from the rendered size.
- RTL: directional glyphs (arrows, horizontal chevrons, send, sidebar toggle) carry `.oria-icon-dir` and mirror under `[dir="rtl"]` (rule in `app/globals.css`). Non-directional glyphs do not flip.
- Always paired with a text label unless space-critical AND has aria-label
- Never use icons to replace verbs (no pencil icon for "Edit" without the word, except in dense table rows)

The full old custom-SVG -> Lucide inventory, the directional set, and the handful
of judgment-call mappings are documented in
`docs/audits/round-14_5c-icon-migration.md`. The dev-only gallery at `app/dev/icons`
(404s in production) renders the whole set for visual QA.

---

## 10. Imagery

- No stock photography
- No abstract gradient hero images
- User-uploaded photos respected (avatars, document thumbnails)
- App icon and brand mark per the logo system

---

## 11. Internationalization in design

- All text wraps to 1.5x English length (German, French test cases)
- RTL layout for Arabic: flip horizontal directions, mirror icons that have direction
- Date/time formats follow user locale, never hardcoded
- Number formats follow user locale (1,234.56 vs 1.234,56 vs 1 234,56)

---

## 12. What to do when in doubt

In order:
1. Open Linear or Things 3 and find a comparable surface. Copy the restraint.
2. Strip everything until the screen looks too empty, then add back the one thing missing.
3. Ask: would a calm friend make this? If it's loud, it's wrong.
4. Ship the simpler version. Iterate from a real user.

---

End of heuristics. Update when a rule changes, not when a screen ships.
