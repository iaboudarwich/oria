import type { ReactElement } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  Building2,
  Bug,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gift,
  Heart,
  Home,
  Inbox,
  Link,
  ListFilter,
  Lock,
  MapPin,
  Menu,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  PanelLeft,
  Paperclip,
  Plane,
  RotateCw,
  Scale,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  Volume2,
  Wallet,
  X,
} from "lucide-react";

/**
 * Oria icon system. Single source: Lucide (heuristics §9).
 *
 * Each export wraps one Lucide glyph behind Oria's own name so call sites stay
 * stable (e.g. `HomeIcon`, `SparkIcon`) and never import from lucide-react
 * directly. The wrapper applies the size-based stroke scale from the heuristics
 * and, for directional glyphs, mirrors under [dir=rtl] (see globals.css).
 *
 * Old custom-SVG names map here; the full old->new inventory and the handful of
 * judgment-call mappings live in docs/audits/round-14_5c-icon-migration.md.
 */

export type IconProps = Omit<LucideProps, "ref"> & { size?: number };

// Stroke width scales with rendered size (heuristics §9):
// 1.5px small (<=20), 2px medium (24), 2.5px large (32+).
function strokeFor(size: number): number {
  if (size >= 32) return 2.5;
  if (size >= 24) return 2;
  return 1.5;
}

// Wrapper component carrying its default size + directional flag so the dev
// gallery (app/dev/icons) can introspect the full set without a second table.
type OriaIcon = ((props: IconProps) => ReactElement) & {
  iconMeta: { defaultSize: number; directional: boolean };
};

function makeIcon(
  Glyph: LucideIcon,
  displayName: string,
  defaultSize: number,
  directional = false,
): OriaIcon {
  const Wrapped = ({ size = defaultSize, className, strokeWidth, ...rest }: IconProps) => {
    const cls = directional
      ? className
        ? `oria-icon-dir ${className}`
        : "oria-icon-dir"
      : className;
    return (
      <Glyph
        size={size}
        strokeWidth={strokeWidth ?? strokeFor(size)}
        className={cls}
        {...rest}
      />
    );
  };
  Wrapped.displayName = displayName;
  return Object.assign(Wrapped, { iconMeta: { defaultSize, directional } });
}

// ── Navigation / areas ──────────────────────────────────────────
export const HomeIcon = makeIcon(Home, "HomeIcon", 18);
export const InboxIcon = makeIcon(Inbox, "InboxIcon", 18);
export const WalletIcon = makeIcon(Wallet, "WalletIcon", 18);
export const PropertiesIcon = makeIcon(Building2, "PropertiesIcon", 18);
export const StaffIcon = makeIcon(Users, "StaffIcon", 18);
export const ApprovalsIcon = makeIcon(ClipboardCheck, "ApprovalsIcon", 18);
export const SparkIcon = makeIcon(Sparkles, "SparkIcon", 18);
export const CalendarIcon = makeIcon(Calendar, "CalendarIcon", 18);
export const SettingsIcon = makeIcon(Settings, "SettingsIcon", 18);
export const ChartIcon = makeIcon(BarChart3, "ChartIcon", 16);

// ── Directional (mirror under RTL) ──────────────────────────────
export const ArrowRightIcon = makeIcon(ArrowRight, "ArrowRightIcon", 16, true);
export const ArrowUpRightIcon = makeIcon(ArrowUpRight, "ArrowUpRightIcon", 14, true);
export const ChevronLeftIcon = makeIcon(ChevronLeft, "ChevronLeftIcon", 14, true);
export const ChevronRightIcon = makeIcon(ChevronRight, "ChevronRightIcon", 14, true);
export const SendIcon = makeIcon(Send, "SendIcon", 16, true);
export const SidebarToggleIcon = makeIcon(PanelLeft, "SidebarToggleIcon", 16, true);

// ── Non-directional chevrons ────────────────────────────────────
export const ChevronDownIcon = makeIcon(ChevronDown, "ChevronDownIcon", 14);
export const ChevronUpIcon = makeIcon(ChevronUp, "ChevronUpIcon", 14);

// ── Actions / controls ──────────────────────────────────────────
export const CheckIcon = makeIcon(Check, "CheckIcon", 16);
export const CheckCircleIcon = makeIcon(CheckCircle2, "CheckCircleIcon", 14);
export const SearchIcon = makeIcon(Search, "SearchIcon", 16);
export const BellIcon = makeIcon(Bell, "BellIcon", 18);
export const MenuIcon = makeIcon(Menu, "MenuIcon", 20);
export const CloseIcon = makeIcon(X, "CloseIcon", 20);
export const TrashIcon = makeIcon(Trash2, "TrashIcon", 18);
export const UploadIcon = makeIcon(Upload, "UploadIcon", 18);
export const DownloadIcon = makeIcon(Download, "DownloadIcon", 14);
export const FilterIcon = makeIcon(ListFilter, "FilterIcon", 16);
export const CopyIcon = makeIcon(Copy, "CopyIcon", 14);
export const LinkIcon = makeIcon(Link, "LinkIcon", 14);
export const RotateIcon = makeIcon(RotateCw, "RotateIcon", 16);
export const EyeIcon = makeIcon(Eye, "EyeIcon", 14);
export const EyeOffIcon = makeIcon(EyeOff, "EyeOffIcon", 14);

// ── Objects / content ───────────────────────────────────────────
export const DocumentIcon = makeIcon(FileText, "DocumentIcon", 18);
export const LockIcon = makeIcon(Lock, "LockIcon", 16);
export const TagIcon = makeIcon(Tag, "TagIcon", 14);
export const ClockIcon = makeIcon(Clock, "ClockIcon", 14);
export const PaperclipIcon = makeIcon(Paperclip, "PaperclipIcon", 16);
export const MapPinIcon = makeIcon(MapPin, "MapPinIcon", 14);
export const PlaneIcon = makeIcon(Plane, "PlaneIcon", 16);
export const HeartIcon = makeIcon(Heart, "HeartIcon", 16);
export const BoxIcon = makeIcon(Box, "BoxIcon", 16);
export const ScalesIcon = makeIcon(Scale, "ScalesIcon", 16);
export const PersonIcon = makeIcon(User, "PersonIcon", 16);
export const GiftIcon = makeIcon(Gift, "GiftIcon", 16);
export const PulseIcon = makeIcon(Activity, "PulseIcon", 14);
export const MicIcon = makeIcon(Mic, "MicIcon", 14);
export const SpeakerIcon = makeIcon(Volume2, "SpeakerIcon", 14);
export const ChatIcon = makeIcon(MessageCircle, "ChatIcon", 14);
export const StarIcon = makeIcon(Star, "StarIcon", 16);
export const CameraIcon = makeIcon(Camera, "CameraIcon", 16);
export const BugIcon = makeIcon(Bug, "BugIcon", 16);
export const AlertIcon = makeIcon(AlertTriangle, "AlertIcon", 18);

// ── Theme toggle ────────────────────────────────────────────────
export const SunIcon = makeIcon(Sun, "SunIcon", 14);
export const MoonIcon = makeIcon(Moon, "MoonIcon", 14);
export const SystemIcon = makeIcon(Monitor, "SystemIcon", 14);

// Registry for the dev-only icons gallery (app/dev/icons). Order groups by
// purpose for easier eyeballing. Keep in sync with the exports above.
export const ALL_ICONS: { name: string; Comp: OriaIcon }[] = [
  { name: "HomeIcon", Comp: HomeIcon },
  { name: "InboxIcon", Comp: InboxIcon },
  { name: "WalletIcon", Comp: WalletIcon },
  { name: "PropertiesIcon", Comp: PropertiesIcon },
  { name: "StaffIcon", Comp: StaffIcon },
  { name: "ApprovalsIcon", Comp: ApprovalsIcon },
  { name: "SparkIcon", Comp: SparkIcon },
  { name: "CalendarIcon", Comp: CalendarIcon },
  { name: "SettingsIcon", Comp: SettingsIcon },
  { name: "ChartIcon", Comp: ChartIcon },
  { name: "ArrowRightIcon", Comp: ArrowRightIcon },
  { name: "ArrowUpRightIcon", Comp: ArrowUpRightIcon },
  { name: "ChevronLeftIcon", Comp: ChevronLeftIcon },
  { name: "ChevronRightIcon", Comp: ChevronRightIcon },
  { name: "SendIcon", Comp: SendIcon },
  { name: "SidebarToggleIcon", Comp: SidebarToggleIcon },
  { name: "ChevronDownIcon", Comp: ChevronDownIcon },
  { name: "ChevronUpIcon", Comp: ChevronUpIcon },
  { name: "CheckIcon", Comp: CheckIcon },
  { name: "CheckCircleIcon", Comp: CheckCircleIcon },
  { name: "SearchIcon", Comp: SearchIcon },
  { name: "BellIcon", Comp: BellIcon },
  { name: "MenuIcon", Comp: MenuIcon },
  { name: "CloseIcon", Comp: CloseIcon },
  { name: "TrashIcon", Comp: TrashIcon },
  { name: "UploadIcon", Comp: UploadIcon },
  { name: "DownloadIcon", Comp: DownloadIcon },
  { name: "FilterIcon", Comp: FilterIcon },
  { name: "CopyIcon", Comp: CopyIcon },
  { name: "LinkIcon", Comp: LinkIcon },
  { name: "RotateIcon", Comp: RotateIcon },
  { name: "EyeIcon", Comp: EyeIcon },
  { name: "EyeOffIcon", Comp: EyeOffIcon },
  { name: "DocumentIcon", Comp: DocumentIcon },
  { name: "LockIcon", Comp: LockIcon },
  { name: "TagIcon", Comp: TagIcon },
  { name: "ClockIcon", Comp: ClockIcon },
  { name: "PaperclipIcon", Comp: PaperclipIcon },
  { name: "MapPinIcon", Comp: MapPinIcon },
  { name: "PlaneIcon", Comp: PlaneIcon },
  { name: "HeartIcon", Comp: HeartIcon },
  { name: "BoxIcon", Comp: BoxIcon },
  { name: "ScalesIcon", Comp: ScalesIcon },
  { name: "PersonIcon", Comp: PersonIcon },
  { name: "GiftIcon", Comp: GiftIcon },
  { name: "PulseIcon", Comp: PulseIcon },
  { name: "MicIcon", Comp: MicIcon },
  { name: "ChatIcon", Comp: ChatIcon },
  { name: "StarIcon", Comp: StarIcon },
  { name: "CameraIcon", Comp: CameraIcon },
  { name: "BugIcon", Comp: BugIcon },
  { name: "AlertIcon", Comp: AlertIcon },
  { name: "SunIcon", Comp: SunIcon },
  { name: "MoonIcon", Comp: MoonIcon },
  { name: "SystemIcon", Comp: SystemIcon },
];
