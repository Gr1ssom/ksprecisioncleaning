import type { Role } from "./session";

/** Who may manage whom. Owners: everyone. Managers: staff only. Nobody edits their own role/status. */
export function canManage(me: { id: string; role: Role }, target: { id: string; role: Role }) {
  if (me.role === "OWNER") return true;
  if (me.role === "MANAGER") return target.role === "STAFF" && target.id !== me.id;
  return false;
}

/** Roles `me` may give someone. */
export const assignableRoles = (me: { role: Role }): Role[] => (me.role === "OWNER" ? ["STAFF", "MANAGER", "OWNER"] : ["STAFF"]);

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  STAFF: { label: "Staff", summary: "Their own jobs, check-ins, room map, SOPs, issues and hours." },
  MANAGER: { label: "Manager", summary: "Everything staff can do, plus scheduling, locations and floor plans, inventory, time approval, clients, invoices and reports. Can add and manage staff." },
  OWNER: { label: "Owner", summary: "Full access, including payroll, pay rates and managing managers and owners." },
};

/** What each access level can do — shown on the Team page. */
export const ACCESS_MATRIX: { area: string; staff: boolean | "own"; manager: boolean | "staff"; owner: boolean }[] = [
  { area: "Check in, jobs, room map, SOPs, issues", staff: "own", manager: true, owner: true },
  { area: "Hours", staff: "own", manager: true, owner: true },
  { area: "Schedule and assign jobs", staff: false, manager: true, owner: true },
  { area: "Locations, floor plans, room tasks", staff: false, manager: true, owner: true },
  { area: "Inventory and supply pickups", staff: false, manager: true, owner: true },
  { area: "Approve and edit time", staff: false, manager: true, owner: true },
  { area: "Clients, prices, invoices, reports", staff: false, manager: true, owner: true },
  { area: "Add and manage team members", staff: false, manager: "staff", owner: true },
  { area: "Pay rates and payroll export", staff: false, manager: false, owner: true },
];
