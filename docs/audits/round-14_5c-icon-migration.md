# Round 14.5c: Lucide icon migration inventory

The Oria icon system moved from a hand-rolled custom-SVG set to Lucide
(`lucide-react`), per heuristics §9. The public API did not change: call sites
still import named glyph components (`HomeIcon`, `SparkIcon`, ...) from
`components/ui/icon`. Each export now wraps one Lucide glyph behind that name.

This doc is the complete old -> new inventory and the exceptions list.

## Conventions applied

- **Size:** each export keeps the same default size it had before the migration,
  so existing call sites render at the same dimensions.
- **Stroke width:** scales with rendered size (heuristics §9): 1.5px at <=20px,
  2px at 24px, 2.5px at 32px+. Computed centrally in `makeIcon`.
- **RTL:** directional glyphs carry `.oria-icon-dir` and mirror under
  `[dir="rtl"]` via a rule in `app/globals.css`. Non-directional glyphs never
  get the class, so they stay upright.

## Directional set (mirrors under RTL)

These point somewhere, so they flip for Arabic:

`ArrowRightIcon`, `ArrowUpRightIcon`, `ChevronLeftIcon`, `ChevronRightIcon`,
`SendIcon`, `SidebarToggleIcon`.

Vertical chevrons (`ChevronDownIcon`, `ChevronUpIcon`) are NOT directional and do
not flip. `LinkIcon`, `RotateIcon`, `PaperclipIcon` are not mirrored (their
meaning is not left/right).

## Full mapping (old custom name -> Lucide glyph)

| Oria export       | Lucide glyph     | Default px | Notes                                                       |
| ----------------- | ---------------- | ---------- | ----------------------------------------------------------- |
| HomeIcon          | `Home`           | 18         |                                                             |
| InboxIcon         | `Inbox`          | 18         |                                                             |
| WalletIcon        | `Wallet`         | 18         |                                                             |
| PropertiesIcon    | `Building2`      | 18         | judgment call (see below)                                   |
| StaffIcon         | `Users`          | 18         |                                                             |
| ApprovalsIcon     | `ClipboardCheck` | 18         |                                                             |
| SparkIcon         | `Sparkles`       | 18         | judgment call (see below)                                   |
| CalendarIcon      | `Calendar`       | 18         |                                                             |
| SettingsIcon      | `Settings`       | 18         |                                                             |
| ChartIcon         | `BarChart3`      | 16         |                                                             |
| ArrowRightIcon    | `ArrowRight`     | 16         | directional                                                 |
| ArrowUpRightIcon  | `ArrowUpRight`   | 14         | directional                                                 |
| ChevronLeftIcon   | `ChevronLeft`    | 14         | directional                                                 |
| ChevronRightIcon  | `ChevronRight`   | 14         | directional                                                 |
| SendIcon          | `Send`           | 16         | directional                                                 |
| SidebarToggleIcon | `PanelLeft`      | 16         | directional                                                 |
| ChevronDownIcon   | `ChevronDown`    | 14         |                                                             |
| ChevronUpIcon     | `ChevronUp`      | 14         |                                                             |
| CheckIcon         | `Check`          | 16         |                                                             |
| CheckCircleIcon   | `CheckCircle2`   | 14         |                                                             |
| SearchIcon        | `Search`         | 16         |                                                             |
| BellIcon          | `Bell`           | 18         |                                                             |
| MenuIcon          | `Menu`           | 20         |                                                             |
| CloseIcon         | `X`              | 20         |                                                             |
| TrashIcon         | `Trash2`         | 18         |                                                             |
| UploadIcon        | `Upload`         | 18         |                                                             |
| DownloadIcon      | `Download`       | 14         |                                                             |
| FilterIcon        | `ListFilter`     | 16         | judgment call (see below)                                   |
| CopyIcon          | `Copy`           | 14         |                                                             |
| LinkIcon          | `Link`           | 14         |                                                             |
| RotateIcon        | `RotateCw`       | 16         |                                                             |
| EyeIcon           | `Eye`            | 14         |                                                             |
| EyeOffIcon        | `EyeOff`         | 14         |                                                             |
| DocumentIcon      | `FileText`       | 18         |                                                             |
| LockIcon          | `Lock`           | 16         |                                                             |
| TagIcon           | `Tag`            | 14         | also re-exported as `CustomSectionIcon`                     |
| ClockIcon         | `Clock`          | 14         |                                                             |
| PaperclipIcon     | `Paperclip`      | 16         |                                                             |
| MapPinIcon        | `MapPin`         | 14         |                                                             |
| PlaneIcon         | `Plane`          | 16         |                                                             |
| HeartIcon         | `Heart`          | 16         |                                                             |
| BoxIcon           | `Box`            | 16         |                                                             |
| ScalesIcon        | `Scale`          | 16         |                                                             |
| PersonIcon        | `User`           | 16         |                                                             |
| GiftIcon          | `Gift`           | 16         |                                                             |
| PulseIcon         | `Activity`       | 14         |                                                             |
| MicIcon           | `Mic`            | 14         | central icon (distinct from the animated mic button, below) |
| ChatIcon          | `MessageCircle`  | 14         |                                                             |
| StarIcon          | `Star`           | 16         |                                                             |
| CameraIcon        | `Camera`         | 16         |                                                             |
| BugIcon           | `Bug`            | 16         |                                                             |
| AlertIcon         | `AlertTriangle`  | 18         |                                                             |
| SunIcon           | `Sun`            | 14         | folded in from theme-toggle                                 |
| MoonIcon          | `Moon`           | 14         | folded in from theme-toggle                                 |
| SystemIcon        | `Monitor`        | 14         | folded in from theme-toggle                                 |

Aliases that resolve through the table: `CustomSectionIcon` (re-export of
`TagIcon` in `lib/sections-meta.ts`) and `DisplayedIcon` (a local variable in
`space-switcher.tsx` bound to one of the mapped icons). Both are covered.

## Exceptions and judgment calls

No icon was silently dropped. Every name maps to a Lucide glyph; nothing was
retained as a custom SVG inside the central system. The four mappings that were
not 1:1 obvious:

1. **PropertiesIcon -> `Building2`.** The old glyph was a house. `Home` is
   already taken by `HomeIcon` (the Today nav), so reusing it would make two
   different nav targets identical. `Building2` reads as "property" and keeps the
   Records area (people / vehicles / properties) visually distinct from Today.

2. **SparkIcon -> `Sparkles`.** The old glyph was an eight-ray asterisk used as
   the suggestion / Ask Oria spark. `Sparkles` is the closest Lucide shape.
   Heuristics §3 cautions against sparkle icons as a generic AI trope; this is a
   pre-existing, intentional brand mark for suggestions, not new chrome, so it is
   retained rather than redesigned. Flagged here so a future round can revisit if
   the brand mark changes.

3. **FilterIcon -> `ListFilter`.** The old glyph was three decreasing horizontal
   lines, which matches `ListFilter` (lines) rather than the funnel-shaped
   `Filter`. `ListFilter` preserves the original silhouette.

4. **ChartIcon -> `BarChart3`.** The old glyph was vertical bars; `BarChart3` is
   the bar-chart variant (vs. the line/area charts), matching the original.

## Out of scope this round (flagged, not migrated)

These are bespoke or data-viz SVGs that are NOT part of the central icon system
and were left untouched (no drive-bys, principle 17):

- `components/ui/mic-button.tsx` (the large animated voice-capture button has
  its own breathing-ring SVG, deliberately bespoke).
- `components/settings/sections-editor.tsx` (`DragHandleIcon`, a six-dot grip
  affordance with no Lucide equivalent that matches the drag pattern).
- Decorative / chart SVGs in `space-switcher.tsx`, `today-pulse.tsx`,
  `work/report-chart.tsx`, and `work/analysis/page.tsx`: these are inline data
  visualizations, not iconography.

## Visual QA

`app/dev/icons` renders every icon across the sizes the app uses, plus a side by
side LTR / RTL strip for the directional set. It is dev-only: in a production
build it returns 404. It stays as a permanent internal reference.
