import {
  LayoutDashboard, MapPin, CalendarDays, Building2, BookOpen, TriangleAlert, Clock, Package,
  BarChart3, Handshake, Receipt, Users, Settings, Wallet, History, UserCog, Ellipsis, type LucideIcon,
} from "lucide-react";
import { atLeast, type Role } from "./session";

/** One page. `min` is the lowest role that may open it (the page itself checks again). */
export type NavLink = { href: string; label: string; icon: LucideIcon; min: Role };
/** A sidebar entry. With `tabs`, it is a section: the pages inside show as tabs across the top. */
export type NavItem = NavLink & { mobile?: boolean; tabs?: NavLink[] };

const dashboard: NavItem = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, min: "STAFF", mobile: true };
const checkin: NavItem = { href: "/checkin", label: "Check in", icon: MapPin, min: "STAFF", mobile: true };
const jobs: NavItem = { href: "/jobs", label: "Jobs", icon: CalendarDays, min: "STAFF", mobile: true };
const clients: NavLink = { href: "/clients", label: "Clients", icon: Handshake, min: "MANAGER" };
const locations: NavLink = { href: "/locations", label: "Locations", icon: Building2, min: "STAFF" };
const sops: NavLink = { href: "/sops", label: "SOPs", icon: BookOpen, min: "STAFF" };
const issues: NavLink = { href: "/issues", label: "Issues", icon: TriangleAlert, min: "STAFF" };
const hours: NavLink = { href: "/time", label: "Hours", icon: Clock, min: "STAFF" };
const payroll: NavLink = { href: "/payroll", label: "Payroll", icon: Wallet, min: "OWNER" };
const account: NavLink = { href: "/account", label: "My account", icon: UserCog, min: "STAFF" };

/** Staff work from a short flat list: the things they do on site. */
const STAFF: NavItem[] = [dashboard, checkin, jobs, { ...locations, mobile: true }, sops, issues, hours, account];

/** Managers and the owner: related pages share one sidebar entry and switch with tabs. */
const LEAD: NavItem[] = [
  dashboard, checkin, jobs,
  { ...clients, mobile: true, tabs: [clients, locations, sops] },
  { ...hours, tabs: [hours, payroll] },
  { href: "/invoices", label: "Invoices", icon: Receipt, min: "MANAGER" },
  { href: "/inventory", label: "Inventory", icon: Package, min: "MANAGER" },
  { href: "/team", label: "Team", icon: Users, min: "MANAGER" },
  {
    href: "/reports", label: "More", icon: Ellipsis, min: "MANAGER",
    tabs: [
      { href: "/reports", label: "Reports", icon: BarChart3, min: "MANAGER" },
      { href: "/activity", label: "Activity", icon: History, min: "OWNER" },
      issues,
      { href: "/settings", label: "Settings", icon: Settings, min: "MANAGER" },
      account,
    ],
  },
];

/** The sidebar for a role, with tabs the role can't open removed. */
export function navFor(role: Role): NavItem[] {
  return (role === "STAFF" ? STAFF : LEAD)
    .filter((i) => atLeast(role, i.min))
    .map((i) => (i.tabs ? { ...i, tabs: i.tabs.filter((t) => atLeast(role, t.min)) } : i));
}

export const onPage = (path: string, href: string) => path === href || path.startsWith(href + "/");
/** Is this sidebar entry (or one of its tabs) the page being shown? */
export const itemActive = (path: string, i: NavItem) => (i.tabs ?? [i]).some((t) => onPage(path, t.href)) || onPage(path, i.href);
/** The tabs to show above the page, if it sits in a section with more than one. */
export function tabsFor(role: Role, path: string): NavLink[] {
  const item = navFor(role).find((i) => i.tabs && i.tabs.some((t) => onPage(path, t.href)));
  return item?.tabs && item.tabs.length > 1 ? item.tabs : [];
}
/** Every page a role can reach from the navigation, flattened (the phone's "More" sheet uses this). */
export const pagesFor = (items: NavItem[]): NavLink[] => items.flatMap((i) => i.tabs ?? [i]);
