# Oria Design Heuristics

The aesthetic floor for every interface decision. Read before opening any UI round. This doc plus the `@theme` tokens in `app/globals.css` are the design contract (there is no frontend-design skill; do not add shadcn/Radix/ui-ux-pro-max).

---

## 0. The North Star

Calm. Confident. Restrained. Specific.

The benchmark stack: Linear, Things 3, Vercel, Notion (the early years). Oria sits on the spectrum between Things 3 (warm, human) and Linear (sharp, deliberate). Closer to Things 3 in warmth, closer to Linear in density.

Never: Stripe-dashboard cluttered. Never: Material-glossy. Never: gradient-vomit. Never: emoji-laden. Never: AI-product-tropes (sparkle icons, "powered by" badges, glowing borders).

---

## 1. The 14 Heuristics

These hold across every screen, every component, every state.

1. **Restraint wins.** Every pixel earns its place. If you can remove it and the screen still works, remove it.

2. **Hierarchy through scale, not weight.** Bigger numbers, bigger type. Don't reach for bold to fix a layout. Reach for size.

3. **Tabular numerals on every number.** Use font-variant-numeric: tabular-nums. Numbers must align on update. No jitter.

4. **Eyebrows label every section.** Tiny uppercase letterspaced label above the section content (text-xs tracking-[0.18em] uppercase text-muted). Sets context. Replaces redundant H2s.

5. **Glass cards, not shadow cards.** bg-surface/80 backdrop-blur-md border border-tile-border. Avoid heavy box-shadows. Cards float through transparency, not elevation.

6. **Living background, slow.** Subtle warm-noise gradient on the canvas. Never animated faster than 30 seconds per cycle. Never on prefers-reduced-motion.

7. **One primary action per region.** A region is a card, a panel, a modal. One filled button. Secondary actions are ghost or text. No competing CTAs.

8. **44px minimum touch target.** Apple HIG floor. Applies to every clickable element on touch surfaces. Use padding to reach it, not visible button size.

9. **Tokens are the only source of truth.** Colors, spacing, radius, type sizes live in the `@theme` block of `app/globals.css`. No hex codes, no magic numbers in components. Period.

10. **Motion explains, never decorates.** Animation tells the user what just changed or what's about to. Layout shifts get crossfade. Insertions get height-grow. Removals get fade-out. Nothing else.

11. **Reduced motion is respected everywhere.** @media (prefers-reduced-motion: reduce) disables all motion above 80ms. Living background freezes. Page transitions become instant.

12. **Color carries meaning, never decoration.**
    - Canvas: #f5f1ea (beige)
    - Tile: #efe9dc (slightly darker beige)
    - Ink: #0f0f0f (near-black, primary text)
    - Muted: #9a8f7e (warm gray, secondary text)
    - Sub: #6b6357 (slightly darker muted, captions)
    - Border: #e2d9c5 (tile border)
    - Success: #2d6a4f (forest)
    - Warning: #b08900 (mustard, never yellow)
    - Error: #9d2933 (oxblood, never red-red)
    - No other colors. Accent colors are earned per context (Personal/Investor/Business/Family Office), drawn from the warm palette only.

13. **Type sets rhythm.**
    - Display (wordmark, hero numbers): Newsreader 400, opsz 72, letter-spacing -0.02em
    - Body and UI: Inter, weights 400/500/600 only
    - Mono (code, IDs, timestamps): JetBrains Mono
    - Body 15px line-height 1.55. Display >= 32px line-height 1.15. Eyebrows 11px tracking 0.18em.

14. **Density toggle.** User picks Comfortable (default) or Compact in Settings. Stored in user_preferences.density. Components consult the token via a hook. No third option, no auto-detect.

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

## 3. Border radius

- Buttons, inputs, chips: 10px
- Cards, tiles: 16px
- Modals, sheets, big surfaces: 24px
- App icon (PWA): 28px
- Hero containers (Today blocks): 22px

Avoid: anything below 8px (feels sharp), anything above 28px (feels rounded-app-y).

---

## 4. Shadows

Heavy shadows are banned. The aesthetic is glass and texture, not paper.

Allowed:
- shadow-sm only on floating elements (toasts, dropdowns, tooltips)
- A single soft "lift" shadow on hovered cards: 0 4px 16px rgba(0,0,0,0.04)

Banned:
- Multi-layer shadows
- Colored shadows
- Inner shadows
- Anything that simulates 3D depth

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

### Sidebar (two-rail, from Round 14.8)
- Outer rail: 56px wide, icon-only contexts (Personal/Investor/Business/Family Office)
- Inner rail: 240px wide, expanded for current context
- Collapsible inner rail (icon-only mode) saved in user_preferences.sidebar_collapsed

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
