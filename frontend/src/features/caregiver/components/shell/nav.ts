import {
  Bell,
  CalendarClock,
  CalendarRange,
  FileWarning,
  Home,
  Inbox,
  Menu,
  MessagesSquare,
  UserRound,
  Wallet,
} from "lucide-react";

/** Message key under `caregiverA.nav`. */
export type NavLabelKey =
  | "today"
  | "requests"
  | "visits"
  | "earnings"
  | "availability"
  | "profile"
  | "notifications"
  | "reports"
  | "messages"
  | "more";

/** Message key under `caregiverA.nav.groups`. */
export type NavGroupKey = "work" | "money" | "myProfile" | "updates";

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: React.ComponentType<{ className?: string }>;
}

export const PRIMARY: NavItem[] = [
  { href: "/caregiver", labelKey: "today", icon: Home },
  { href: "/caregiver/requests", labelKey: "requests", icon: Inbox },
  { href: "/caregiver/visits", labelKey: "visits", icon: CalendarRange },
  { href: "/caregiver/earnings", labelKey: "earnings", icon: Wallet },
];

const MESSAGES_ITEM: NavItem = { href: "/caregiver/messages", labelKey: "messages", icon: MessagesSquare };

export const SECONDARY: NavItem[] = [
  { href: "/caregiver/availability", labelKey: "availability", icon: CalendarClock },
  { href: "/caregiver/profile", labelKey: "profile", icon: UserRound },
  { href: "/caregiver/notifications", labelKey: "notifications", icon: Bell },
  { href: "/caregiver/reports", labelKey: "reports", icon: FileWarning },
  MESSAGES_ITEM,
];

/** Desktop sidebar sections (same items as the mobile tabs + More menu). */
export const SIDEBAR_GROUPS: { labelKey?: NavGroupKey; items: NavItem[] }[] = [
  { items: [PRIMARY[0], MESSAGES_ITEM] },
  { labelKey: "work", items: [PRIMARY[1], PRIMARY[2]] },
  { labelKey: "money", items: [PRIMARY[3]] },
  { labelKey: "myProfile", items: [SECONDARY[0], SECONDARY[1]] },
  { labelKey: "updates", items: [SECONDARY[2], SECONDARY[3]] },
];

export const MORE: NavItem = { href: "/caregiver/more", labelKey: "more", icon: Menu };

export const isActive = (pathname: string, href: string) =>
  href === "/caregiver" ? pathname === "/caregiver" : pathname === href || pathname.startsWith(`${href}/`);
