/**
 * Demo data for trying the app (logins end in @ks.test, password "password123").
 *
 *   ALLOW_DEMO_SEED=1 npm run demo:seed            # load demo data
 *   ALLOW_DEMO_SEED=1 npm run demo:seed -- --clear # remove ALL business data + demo logins
 *
 * Both refuse to run once a real (non-@ks.test) team member exists, so they can't touch a live
 * business. Service types and common room tasks are configuration and are left alone.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { today } from "../src/lib/format";

const key = process.env.SUPABASE_SECRET_KEY ?? "";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => {
      if (key.startsWith("sb_secret_") || key === "proxy-injected") {
        const h = new Headers(init?.headers);
        h.delete("Authorization");
        return fetch(input, { ...init, headers: h });
      }
      return fetch(input, init);
    },
  },
});

async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

const DATA_TABLES = ["VisitFeedback", "VisitReport", "InspectionRoom", "Inspection", "RoomPhoto", "RoomTaskCheck", "RoomSession", "SopAck", "Checkin", "TimeEntry", "StockMovement", "StockLevel",
  "Assignment", "Invoice", "Issue", "Room", "Layout", "ClientRate", "Sop", "Location", "Client", "Supply", "SupplyDepot", "Announcement", "User"];

async function guard() {
  if (process.env.ALLOW_DEMO_SEED !== "1") throw new Error("Set ALLOW_DEMO_SEED=1 to confirm you want demo data in this project.");
  const users = await q(sb.from("User").select("email"), "users") as { email: string }[];
  const real = users.filter((u) => !u.email.endsWith("@ks.test"));
  if (real.length) throw new Error(`Refusing: real team members exist (${real.map((u) => u.email).join(", ")}).`);
}

async function clear() {
  for (const t of DATA_TABLES) await q(sb.from(t).delete().not("id", "is", null), `clear ${t}`);
  await q(sb.from("BillingRun").delete().not("month", "is", null), "clear BillingRun");
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.endsWith("@ks.test")) await sb.auth.admin.deleteUser(u.id);
  const files = await sb.storage.from("media").list("", { limit: 1000 });
  for (const dir of files.data ?? []) {
    const all = await sb.storage.from("media").list(dir.name, { limit: 1000 });
    if (all.data?.length) await sb.storage.from("media").remove(all.data.map((f) => `${dir.name}/${f.name}`));
  }
}

async function seed() {
  await clear();
  const person = async (name: string, email: string, role: string, hourlyRate: number, phone?: string) => {
    const { data, error } = await sb.auth.admin.createUser({ email, password: "password123", email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    await q(sb.from("User").insert({ id: data.user!.id, name, email, role, hourlyRate, phone: phone ?? null }), "profile");
    return data.user!.id;
  };
  const owner = await person("Kara Simmons", "owner@ks.test", "OWNER", 0);
  const manager = await person("Marcus Lee", "manager@ks.test", "MANAGER", 24);
  const ana = await person("Ana Torres", "staff@ks.test", "STAFF", 17.5, "555-0101");
  const devon = await person("Devon Price", "devon@ks.test", "STAFF", 16, "555-0102");
  void owner;

  type Row = { id: string; latitude?: number | null; longitude?: number | null };
  const one = async <T = Row>(table: string, row: object) => (await q(sb.from(table).insert(row).select("*").single(), table)) as T & Row;
  const acme = await one("Client", { name: "Acme Dental Group", contactName: "Dr. Patel", email: "billing@acmedental.test", phone: "555-2000", billingAddress: "100 Main St, Overland Park, KS" });
  const brick = await one("Client", { name: "Brickyard Offices LLC", contactName: "Jen Ortiz", email: "ap@brickyard.test", billingAddress: "220 W 8th St, Kansas City, MO" });
  const johnson = await one("Client", { name: "Johnson Family", contactName: "Beth Johnson", email: "beth.johnson@example.test", phone: "555-3300" });

  const svc = Object.fromEntries((await q(sb.from("ServiceType").select("id, name"), "services") as { id: string; name: string }[]).map((s) => [s.id, s.id]));
  const STD = svc.svc_standard, DEEP = svc.svc_deep, MAINT = svc.svc_maintenance;
  await q(sb.from("ClientRate").insert([
    { clientId: acme.id, serviceTypeId: STD, price: 185 }, { clientId: acme.id, serviceTypeId: DEEP, price: 420 }, { clientId: acme.id, serviceTypeId: MAINT, price: 120 },
    { clientId: brick.id, serviceTypeId: STD, price: 340 }, { clientId: brick.id, serviceTypeId: DEEP, price: 780 }, { clientId: brick.id, serviceTypeId: MAINT, price: 220 },
    { clientId: johnson.id, serviceTypeId: STD, price: 210 }, { clientId: johnson.id, serviceTypeId: DEEP, price: 465 },
  ]), "prices");

  const L1 = await one("Location", { name: "Acme Dental – Overland Park", address: "100 Main St, Overland Park, KS", latitude: 38.9822, longitude: -94.6708, clientId: acme.id, accessNotes: "Key box on rear door, code 4417. Alarm code from your manager." });
  const L2 = await one("Location", { name: "Brickyard Offices – Floor 2-3", address: "220 W 8th St, Kansas City, MO", latitude: 39.1031, longitude: -94.5866, clientId: brick.id, accessNotes: "Check in with lobby security. Park in garage level P2." });
  const home = await one("Location", { name: "Johnson Residence", address: "4512 W 112th Terrace, Leawood, KS", latitude: 38.9192, longitude: -94.6266, clientId: johnson.id, accessNotes: "Garage code 2291. Dog (Biscuit) is friendly – keep the back gate closed." });

  const depot = await one("SupplyDepot", { name: "Main Warehouse", address: "1500 Industrial Dr, Olathe, KS", latitude: 38.8814, longitude: -94.8191 });
  const depot2 = await one("SupplyDepot", { name: "Downtown Closet", address: "220 W 8th St (B1), Kansas City, MO", latitude: 39.1031, longitude: -94.5866 });
  const supplies = await q(sb.from("Supply").insert([
    ["Trash bags 33gal (case)", "TB-33", "case", 28, 4], ["Microfiber cloths (12pk)", "MF-12", "pack", 14, 6], ["Glass cleaner (gal)", "GC-1", "gallon", 9.5, 4],
    ["Disinfectant concentrate (gal)", "DS-1", "gallon", 22, 3], ["Paper towels (case)", "PT-C", "case", 41, 3], ["Toilet paper (case)", "TP-C", "case", 52, 3],
    ["Nitrile gloves (box)", "NG-M", "box", 11, 8], ["Mop heads", "MH-1", "each", 7, 5],
  ].map(([name, sku, unit, unitCost, reorderAt]) => ({ name, sku, unit, unitCost, reorderAt }))).select("id"), "supplies") as { id: string }[];
  await q(sb.from("StockLevel").insert(supplies.flatMap((s, i) => [
    { supplyId: s.id, depotId: depot.id, quantity: [12, 20, 3, 6, 9, 2, 30, 10][i] },
    { supplyId: s.id, depotId: depot2.id, quantity: [3, 4, 2, 1, 2, 4, 5, 2][i] },
  ])), "stock");

  await q(sb.from("Sop").insert([
    { title: "Restroom Deep Clean", category: "Restrooms", body: "Put on gloves and eye protection\nPost wet-floor sign at entrance\nApply disinfectant to bowls, seats and urinals – let dwell 10 min\nClean mirrors and fixtures\nWipe partitions, dispensers and door handles\nRestock paper, soap and liners\nMop from the far corner toward the exit" },
    { title: "Chemical Safety & Dilution", category: "Safety", body: "Never mix bleach with ammonia or acids\nUse the dilution station – disinfectant 1:64, glass cleaner ready to use\nLabel every secondary bottle\nSDS binder is in each supply closet\nReport spills or exposure right away under Issues" },
    { title: "Closing / Lock-up", category: "General", body: "Walk all rooms – lights off except security lights\nConfirm all doors are locked\nSet the alarm and wait for armed confirmation\nCheck out in the app before leaving the lot" },
    { title: "Operatory Disinfection", category: "Medical", locationId: L1.id, body: "Do NOT touch dental equipment, trays or computers\nWipe counters, chair arms and light handles with hospital-grade disinfectant\nNever empty sharps – leave for clinical staff\nMop with disinfectant, change water every 3 rooms" },
  ]), "SOPs");

  const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const T = (label: string, minutes: number | null = null, only: string[] = []) => ({ label, minutes, serviceTypeIds: only });
  const plan = await one("Layout", { name: "Main floor", locationId: home.id, aspect: 1.6 });
  const homeRooms = await q(sb.from("Room").insert([
    { name: "Kitchen", type: "Kitchen", points: rect(4, 6, 36, 40), color: "#d97706", customTasks: [T("Wipe dog bowl area", 3), T("Clean inside fridge", 20, [DEEP]), T("Clean inside oven", 25, [DEEP])] },
    { name: "Living Room", type: "Living Area", points: rect(40, 6, 34, 52), color: "#2563eb", customTasks: [T("Dust piano – dry cloth only", 5)] },
    { name: "Primary Bedroom", type: "Bedroom", points: rect(74, 6, 22, 44), color: "#7c3aed", customTasks: [T("Wash windows inside", 15, [DEEP])] },
    { name: "Primary Bath", type: "Bathroom", points: rect(74, 50, 22, 24), color: "#059669", customTasks: [T("Squeegee glass shower door", 4), T("Scrub grout", 20, [DEEP])] },
    { name: "Hallway", type: "Hallway", points: [[4, 46], [40, 46], [40, 58], [74, 58], [74, 66], [4, 66]], color: "#475569", customTasks: [] },
    { name: "Kids Bedroom", type: "Bedroom", points: rect(4, 66, 30, 28), color: "#db2777", customTasks: [T("Pick up toys into bins", 5)] },
    { name: "Hall Bath", type: "Bathroom", points: rect(34, 66, 18, 28), color: "#0d9488", customTasks: [] },
    { name: "Entry", type: "Entry", points: rect(52, 66, 22, 28), color: "#9333ea", customTasks: [] },
  ].map((r, i) => ({ ...r, layoutId: plan.id, sortOrder: i }))).select("id, name"), "rooms") as { id: string; name: string }[];
  const dental = await one("Layout", { name: "Main floor", locationId: L1.id, aspect: 1.6 });
  await q(sb.from("Room").insert([
    { name: "Reception & Waiting", type: "Entry", points: rect(4, 6, 40, 40), color: "#2563eb", customTasks: [T("Sanitize clipboard pens", 3)] },
    { name: "Operatories 1-3", type: "Operatory", points: rect(44, 6, 52, 40), color: "#dc2626", customTasks: [] },
    { name: "Restrooms", type: "Bathroom", points: rect(4, 46, 24, 48), color: "#059669", customTasks: [] },
    { name: "Break Room", type: "Kitchen", points: rect(28, 46, 30, 48), color: "#d97706", customTasks: [T("Run and empty the dishwasher", 8)] },
    { name: "Offices", type: "Office", points: rect(58, 46, 38, 48), color: "#7c3aed", customTasks: [] },
  ].map((r, i) => ({ ...r, layoutId: dental.id, sortOrder: i }))), "dental rooms");

  const std = (labels: string[], done = false) => labels.map((label) => ({ label, done }));
  const job = (o: object) => ({ createdById: manager, serviceTypeId: STD, status: "SCHEDULED", tasks: [], ...o });
  await q(sb.from("Assignment").insert([
    job({ locationId: L1.id, userId: ana, date: today(0), startTime: "18:00", endTime: "21:00", tasks: std(["Trash & recycling", "Vacuum waiting room"]) }),
    job({ locationId: L2.id, userId: devon, date: today(0), startTime: "04:30", endTime: "08:30", tasks: std(["Lobby standard", "Floor 2 offices", "Floor 3 offices", "Kitchenettes"]) }),
    job({ locationId: home.id, userId: ana, date: today(0), startTime: "10:00", endTime: "13:00", serviceTypeId: DEEP, tasks: std(["Walk-through with homeowner"]) }),
    job({ locationId: L1.id, userId: ana, date: today(1), startTime: "18:30", endTime: "20:30", serviceTypeId: MAINT }),
    job({ locationId: L2.id, userId: null, date: today(2), startTime: "04:30", notes: "Open shift – needs coverage" }),
  ]), "jobs");

  // History: completed visits with time entries, check-ins and room timers (drives reports, payroll, invoices).
  const minutes: Record<string, number> = { Kitchen: 38, "Living Room": 22, "Primary Bedroom": 18, "Primary Bath": 27, Hallway: 8, "Kids Bedroom": 20, "Hall Bath": 15, Entry: 6 };
  for (let i = 1; i <= 6; i++) {
    for (const [loc, user, startH, hrs, svcId] of [[L1, ana, 18, 3, i <= 2 ? MAINT : STD], [L2, devon, 4, 4, i === 6 ? DEEP : STD]] as const) {
      const d = today(-i);
      const a = await one<{ id: string }>("Assignment", job({ locationId: loc.id, userId: user, date: d, startTime: `${String(startH).padStart(2, "0")}:00`, status: "COMPLETED", serviceTypeId: svcId }));
      const inAt = new Date(Date.parse(d + "T00:00:00Z") + (startH + 6) * 3600_000);
      const outAt = new Date(inAt.getTime() + hrs * 3600_000 + (i % 3) * 600_000);
      await q(sb.from("TimeEntry").insert({ userId: user, assignmentId: a.id, clockIn: inAt.toISOString(), clockOut: outAt.toISOString(), approved: i > 2 }), "time");
      await q(sb.from("Checkin").insert([
        { type: "SITE_IN", userId: user, locationId: loc.id, assignmentId: a.id, latitude: loc.latitude, longitude: loc.longitude, distanceM: 12, withinFence: true, at: inAt.toISOString() },
        { type: "SITE_OUT", userId: user, locationId: loc.id, assignmentId: a.id, latitude: loc.latitude, longitude: loc.longitude, distanceM: i === 3 ? 900 : 20, withinFence: i !== 3, at: outAt.toISOString() },
      ]), "check-ins");
    }
  }
  for (const [i, svcId] of [[7, STD], [14, DEEP], [21, STD]] as const) {
    const d = today(-i);
    const a = await one<{ id: string }>("Assignment", job({ locationId: home.id, userId: ana, date: d, startTime: "10:00", status: "COMPLETED", serviceTypeId: svcId }));
    let t = new Date(Date.parse(d + "T16:00:00Z"));
    await q(sb.from("TimeEntry").insert({ userId: ana, assignmentId: a.id, clockIn: t.toISOString(), clockOut: new Date(t.getTime() + 165 * 60_000).toISOString(), approved: true }), "time");
    const sessions = [];
    for (const r of homeRooms) {
      const end = new Date(t.getTime() + (minutes[r.name] + ((i * r.name.length) % 7) - 3 + (svcId === DEEP ? 12 : 0)) * 60_000);
      sessions.push({ assignmentId: a.id, roomId: r.id, userId: ana, startedAt: t.toISOString(), endedAt: end.toISOString() });
      t = new Date(end.getTime() + 2 * 60_000);
    }
    await q(sb.from("RoomSession").insert(sessions), "room timers");
  }
  await q(sb.from("Issue").insert({ title: "Broken soap dispenser – men's room", detail: "Dispenser cover cracked, needs replacing.", locationId: L2.id, reportedById: devon }), "issue");
  await q(sb.from("Announcement").insert({ title: "Welcome to the new KS app!", body: "Check in at supply pickup and on arrival at every site. Questions? Ask Marcus." }), "announcement");
  console.log("Demo data loaded. Logins (password123): owner@ks.test, manager@ks.test, staff@ks.test, devon@ks.test");
}

(async () => {
  await guard();
  if (process.argv.includes("--clear")) { await clear(); console.log("Demo data and demo logins removed."); }
  else await seed();
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
