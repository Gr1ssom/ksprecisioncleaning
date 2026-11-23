export type Role = "STAFF" | "MANAGER" | "OWNER";
export const ROLE_RANK: Record<Role, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };
export const atLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];
