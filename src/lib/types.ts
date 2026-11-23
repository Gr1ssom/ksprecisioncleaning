// Row shapes of the public tables (see supabase/migrations). Timestamps are ISO strings,
// DATE columns are "YYYY-MM-DD", numeric columns arrive as numbers.
import type { Role } from "./session";

export type Profile = {
  id: string; name: string; email: string; phone: string | null; role: Role; hourlyRate: number;
  waveEmployeeId: string | null; active: boolean; createdAt: string;
};
export type Client = {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  billingAddress: string | null; waveCustomerId: string | null; notes: string | null; createdAt: string;
};
export type Location = {
  id: string; name: string; address: string; latitude: number | null; longitude: number | null; geofenceM: number;
  accessNotes: string | null; active: boolean; clientId: string | null; createdAt: string;
};
export type SupplyDepot = { id: string; name: string; address: string; latitude: number | null; longitude: number | null; geofenceM: number };
export type Sop = { id: string; title: string; category: string; body: string; locationId: string | null; version: number; updatedAt: string };
export type SopAck = { id: string; sopId: string; userId: string; version: number; ackedAt: string };
export type ServiceType = { id: string; name: string; sortOrder: number; active: boolean };
export type ClientRate = { id: string; clientId: string; serviceTypeId: string; price: number };

/** A task as stored: on a room (custom) or a room type (common). Empty serviceTypeIds = every visit. */
export type TaskDef = { label: string; serviceTypeIds: string[]; minutes: number | null };
export type Layout = { id: string; name: string; locationId: string; imagePath: string | null; aspect: number; sortOrder: number; updatedAt: string };
export type Room = {
  id: string; layoutId: string; name: string; type: string; points: number[][]; color: string;
  customTasks: TaskDef[]; notes: string | null; sortOrder: number;
};
export type RoomTypeTask = { id: string; roomType: string; label: string; sortOrder: number; serviceTypeIds: string[]; minutes: number | null };
export type RoomSession = { id: string; assignmentId: string; roomId: string; userId: string; startedAt: string; endedAt: string | null };
export type RoomTaskCheck = { id: string; assignmentId: string; roomId: string; label: string; userId: string; doneAt: string };
export type RoomPhoto = { id: string; assignmentId: string; roomId: string; userId: string; kind: "before" | "after"; path: string; createdAt: string };

export type AssignmentStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "CANCELLED";
export type Assignment = {
  id: string; locationId: string; serviceTypeId: string | null; userId: string | null; createdById: string | null;
  date: string; startTime: string; endTime: string | null; status: AssignmentStatus; tasks: { label: string; done: boolean }[];
  notes: string | null; invoiceId: string | null; createdAt: string;
};
export type CheckinType = "SUPPLY_PICKUP" | "SITE_IN" | "SITE_OUT";
export type Checkin = {
  id: string; type: CheckinType; userId: string; locationId: string | null; depotId: string | null; assignmentId: string | null;
  latitude: number | null; longitude: number | null; accuracyM: number | null; distanceM: number | null; withinFence: boolean | null;
  note: string | null; at: string;
};
export type TimeEntry = { id: string; userId: string; assignmentId: string | null; clockIn: string; clockOut: string | null; approved: boolean; note: string | null };
export type Supply = { id: string; name: string; sku: string | null; unit: string; unitCost: number; reorderAt: number };
export type StockLevel = { id: string; supplyId: string; depotId: string; quantity: number };
export type StockMovement = { id: string; supplyId: string; depotId: string; userId: string | null; delta: number; reason: string; at: string };
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";
export type Invoice = {
  id: string; number: string; clientId: string; issueDate: string; dueDate: string; status: InvoiceStatus;
  lines: { description: string; quantity: number; unitPrice: number }[]; total: number; memo: string | null;
  waveInvoiceId: string | null; waveViewUrl: string | null; waveError: string | null; sentAt: string | null; createdAt: string;
};
export type Issue = {
  id: string; title: string; detail: string | null; photoPath: string | null; locationId: string | null; reportedById: string;
  status: "OPEN" | "RESOLVED"; createdAt: string; resolvedAt: string | null;
};
export type Announcement = { id: string; title: string; body: string; createdAt: string };
