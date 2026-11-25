// Row shapes of the public tables (see supabase/migrations). Timestamps are ISO strings,
// DATE columns are "YYYY-MM-DD", numeric columns arrive as numbers.
import type { Role } from "./session";

export type Profile = {
  id: string; name: string; email: string; phone: string | null; role: Role; hourlyRate: number;
  waveEmployeeId: string | null; active: boolean; createdAt: string;
  /** Must choose their own password before using the app (new login or temporary password). */
  mustChangePassword: boolean;
};
export type Client = {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  billingAddress: string | null; waveCustomerId: string | null; notes: string | null; createdAt: string;
  /** Visit reports after check-out (off by default) and where they go (blank = the billing email). */
  reportsEnabled: boolean; reportEmail: string | null;
  /** Secret part of the client's read-only portal link (/c/<token>). The owner can change it. */
  portalToken: string;
};
export type Location = {
  id: string; name: string; address: string; latitude: number | null; longitude: number | null; geofenceM: number;
  accessNotes: string | null; active: boolean; clientId: string | null; createdAt: string;
  /** Job template (see src/lib/templates.ts); read with parseTemplate(). */
  jobTemplate: unknown;
};
export type SupplyDepot = { id: string; name: string; address: string; latitude: number | null; longitude: number | null; geofenceM: number };
export type Sop = {
  id: string; title: string; category: string; body: string; version: number; updatedAt: string;
  /** Who it applies to: a location, a client (all its locations), or neither = the whole company. */
  locationId: string | null; clientId: string | null;
  /** Optional sources besides typed steps: a web link (Google Drive etc.) and/or an uploaded file. */
  linkUrl: string | null; filePath: string | null; fileName: string | null;
};
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
  /** Re-clean loop: the job this one fixes, and the inspection or issue behind it. */
  followUpOfId: string | null; inspectionId: string | null; issueId: string | null;
  /** Free visit (re-cleans): never invoiced, no revenue in reports. */
  noCharge: boolean;
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
  id: string; title: string; detail: string | null; photoPath: string | null; locationId: string | null;
  /** Null for client complaints (source CLIENT). */
  reportedById: string | null; source: "STAFF" | "CLIENT"; assignmentId: string | null;
  status: "OPEN" | "RESOLVED"; createdAt: string; resolvedAt: string | null;
};
export type Announcement = { id: string; title: string; body: string; createdAt: string };
export type AuditEntry = {
  id: string; at: string; actorId: string | null; action: string; entity: string; entityId: string | null;
  summary: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
};
export type AppError = { id: string; at: string; message: string; digest: string | null; path: string | null; method: string | null; kind: string | null };

// Phase 2: shift clock, time off, availability, open-shift requests, notifications.
export type Shift = {
  id: string; userId: string; clockIn: string; clockOut: string | null; approved: boolean; note: string | null;
  inLat: number | null; inLng: number | null; outLat: number | null; outLng: number | null;
};
export type Break = { id: string; userId: string; shiftId: string | null; startedAt: string; endedAt: string | null };
export type RequestStatus = "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
export type TimeOff = {
  id: string; userId: string; startDate: string; endDate: string; reason: string | null; status: RequestStatus;
  decidedById: string | null; decidedAt: string | null; createdAt: string;
};
export type AvailabilityRow = { userId: string; weekday: number; available: boolean; startTime: string | null; endTime: string | null };
export type ShiftClaim = {
  id: string; assignmentId: string; userId: string; status: RequestStatus; note: string | null;
  decidedById: string | null; decidedAt: string | null; createdAt: string;
};
export type Notification = {
  id: string; userId: string; kind: string; title: string; body: string | null; url: string | null;
  dedupe: string | null; createdAt: string; readAt: string | null;
};

// Phase 3: inspections, client visit reports and feedback, monthly billing runs.
export type InspectionResult = "PASS" | "TOUCH_UP" | "FAIL";
export type Inspection = {
  id: string; assignmentId: string; inspectorId: string | null; cleanerId: string | null; locationId: string;
  note: string | null; score: number | null; createdAt: string; completedAt: string | null;
};
export type InspectionRoom = {
  id: string; inspectionId: string; roomId: string | null; roomName: string; result: InspectionResult;
  note: string | null; photoPath: string | null; createdAt: string;
};
export type VisitReport = {
  id: string; assignmentId: string; token: string; createdAt: string; sentAt: string | null; sentTo: string | null; emailError: string | null;
};
export type VisitFeedback = {
  id: string; assignmentId: string; rating: number; comment: string | null; cleanerId: string | null; locationId: string;
  createdAt: string; updatedAt: string;
};
export type BillingRun = { month: string; startedAt: string; invoices: number; byId: string | null };
