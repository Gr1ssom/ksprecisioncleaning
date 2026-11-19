import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { todayUTC } from "../src/lib/format";

const db = new PrismaClient();
// Business-timezone "today", same as the app uses.
const day = (o = 0) => todayUTC(o);

async function main() {
  // This seed wipes every table first. Never let it touch a hosted database by accident.
  if (/supabase|pooler/.test(process.env.DATABASE_URL ?? "") && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo data into a hosted database. Use `npm run create-owner` there instead.");
  }
  // wipe (dev only)
  await db.$transaction([
    db.sopAck.deleteMany(), db.checkin.deleteMany(), db.timeEntry.deleteMany(), db.stockMovement.deleteMany(),
    db.stockLevel.deleteMany(), db.assignment.deleteMany(), db.invoice.deleteMany(), db.issue.deleteMany(),
    db.roomTaskCheck.deleteMany(), db.roomSession.deleteMany(), db.room.deleteMany(), db.roomTypeTask.deleteMany(), db.layout.deleteMany(), db.clientRate.deleteMany(), db.serviceType.deleteMany(), db.sop.deleteMany(), db.location.deleteMany(), db.client.deleteMany(),
    db.supply.deleteMany(), db.supplyDepot.deleteMany(), db.announcement.deleteMany(), db.user.deleteMany(),
  ]);

  const hash = await bcrypt.hash("password123", 10);
  const owner = await db.user.create({ data: { name: "Kara Simmons", email: "owner@ks.test", role: "OWNER", passwordHash: hash, hourlyRate: 0 } });
  const manager = await db.user.create({ data: { name: "Marcus Lee", email: "manager@ks.test", role: "MANAGER", passwordHash: hash, hourlyRate: 24 } });
  const s1 = await db.user.create({ data: { name: "Ana Torres", email: "staff@ks.test", phone: "555-0101", role: "STAFF", passwordHash: hash, hourlyRate: 17.5 } });
  const s2 = await db.user.create({ data: { name: "Devon Price", email: "devon@ks.test", phone: "555-0102", role: "STAFF", passwordHash: hash, hourlyRate: 16 } });

  const acme = await db.client.create({ data: { name: "Acme Dental Group", contactName: "Dr. Patel", email: "billing@acmedental.test", phone: "555-2000", billingAddress: "100 Main St, Overland Park, KS" } });
  const brick = await db.client.create({ data: { name: "Brickyard Offices LLC", contactName: "Jen Ortiz", email: "ap@brickyard.test", billingAddress: "220 W 8th St, Kansas City, MO" } });

  const L1 = await db.location.create({ data: { name: "Acme Dental – Overland Park", address: "100 Main St, Overland Park, KS", latitude: 38.9822, longitude: -94.6708, clientId: acme.id, accessNotes: "Key box on rear door, code 4417. Alarm panel left of door – code given by manager." } });
  const L2 = await db.location.create({ data: { name: "Brickyard Offices – Floor 2-3", address: "220 W 8th St, Kansas City, MO", latitude: 39.1031, longitude: -94.5866, clientId: brick.id, accessNotes: "Check in with lobby security. Park in garage level P2." } });
  const L3 = await db.location.create({ data: { name: "Acme Dental – Lenexa", address: "8700 Renner Blvd, Lenexa, KS", latitude: 38.9636, longitude: -94.7752, clientId: acme.id } });

  // Service types (same ids as the migration) and per-client prices
  const svc = {
    std: await db.serviceType.create({ data: { id: "svc_standard", name: "Standard clean", sortOrder: 0 } }),
    deep: await db.serviceType.create({ data: { id: "svc_deep", name: "Deep clean", sortOrder: 1 } }),
    maint: await db.serviceType.create({ data: { id: "svc_maintenance", name: "Maintenance clean", sortOrder: 2 } }),
  };
  const price = async (clientId: string, std: number, deep: number, maint: number) =>
    db.clientRate.createMany({ data: [
      { clientId, serviceTypeId: svc.std.id, price: std },
      { clientId, serviceTypeId: svc.deep.id, price: deep },
      { clientId, serviceTypeId: svc.maint.id, price: maint },
    ] });
  await price(acme.id, 185, 420, 120);
  await price(brick.id, 340, 780, 220);

  const depot = await db.supplyDepot.create({ data: { name: "Main Warehouse", address: "1500 Industrial Dr, Olathe, KS", latitude: 38.8814, longitude: -94.8191 } });
  const depot2 = await db.supplyDepot.create({ data: { name: "Downtown Closet", address: "220 W 8th St (B1), Kansas City, MO", latitude: 39.1031, longitude: -94.5866 } });

  const supplies = await Promise.all(
    [
      ["Trash bags 33gal (case)", "TB-33", "case", 28, 4],
      ["Microfiber cloths (12pk)", "MF-12", "pack", 14, 6],
      ["Glass cleaner (gal)", "GC-1", "gallon", 9.5, 4],
      ["Disinfectant concentrate (gal)", "DS-1", "gallon", 22, 3],
      ["Paper towels (case)", "PT-C", "case", 41, 3],
      ["Toilet paper (case)", "TP-C", "case", 52, 3],
      ["Nitrile gloves (box)", "NG-M", "box", 11, 8],
      ["Mop heads", "MH-1", "each", 7, 5],
    ].map(([name, sku, unit, cost, reorderAt]) =>
      db.supply.create({ data: { name: name as string, sku: sku as string, unit: unit as string, unitCost: cost as number, reorderAt: reorderAt as number } }),
    ),
  );
  for (const [i, s] of supplies.entries()) {
    await db.stockLevel.create({ data: { supplyId: s.id, depotId: depot.id, quantity: [12, 20, 3, 6, 9, 2, 30, 10][i] } });
    await db.stockLevel.create({ data: { supplyId: s.id, depotId: depot2.id, quantity: [3, 4, 2, 1, 2, 4, 5, 2][i] } });
  }

  await db.sop.createMany({
    data: [
      { title: "Restroom Deep Clean", category: "Restrooms", body: "Put on gloves and eye protection\nPost wet-floor sign at entrance\nFlush toilets; apply disinfectant to bowls, seats and urinals – let dwell 10 min\nClean mirrors and fixtures with glass cleaner\nWipe partitions, dispensers and door handles (high-touch)\nScrub bowls, wipe exterior top-to-bottom\nRestock paper, soap and liners\nMop floor from far corner toward exit\nEmpty trash and replace liner" },
      { title: "Chemical Safety & Dilution", category: "Safety", body: "Never mix bleach with ammonia or acids\nUse the dilution station – disinfectant 1:64, glass cleaner RTU\nLabel every secondary bottle\nSDS binder is in each supply closet\nReport spills or exposure immediately via Issues" },
      { title: "Closing / Lock-up", category: "General", body: "Walk all rooms – lights off except security lights\nConfirm all doors locked\nSet alarm and wait for armed confirmation\nCheck out in the app before leaving the lot" },
      { title: "Operatory Disinfection", category: "Medical", locationId: L1.id, body: "Do NOT touch dental equipment, trays or computers\nWipe counters, chair arms and light handles with hospital-grade disinfectant\nEmpty sharps? NEVER – leave for clinical staff\nMop with disinfectant, change water every 3 rooms" },
      { title: "Brickyard Lobby Standard", category: "Client-specific", locationId: L2.id, body: "Glass entry doors streak-free inside and out\nVacuum entry mats, spot-clean as needed\nPolish elevator panels\nLobby must be complete before 6:30 AM" },
    ],
  });

  // ---- Common tasks by room type (company-wide) ----
  const common: Record<string, string[]> = {
    Kitchen: ["Wipe counters & backsplash", "Clean sink & faucet", "Wipe appliance fronts", "Clean microwave in/out", "Empty trash", "Sweep & mop floor"],
    Bathroom: ["Disinfect toilet", "Clean shower/tub", "Clean sink & mirror", "Restock paper & soap", "Empty trash", "Mop floor"],
    Bedroom: ["Make bed / change linens", "Dust surfaces", "Vacuum floor", "Empty trash"],
    "Living Area": ["Dust surfaces & shelves", "Wipe electronics (dry)", "Vacuum upholstery", "Vacuum/mop floor"],
    Office: ["Empty trash & recycling", "Dust desks (don't move papers)", "Wipe phones & keyboards", "Vacuum floor"],
    Hallway: ["Dust baseboards", "Wipe light switches", "Vacuum/mop floor"],
    Entry: ["Clean entry glass", "Shake/vacuum mats", "Mop floor"],
    Operatory: ["Wipe counters & chair arms", "Wipe light handles", "Mop with disinfectant"],
  };
  for (const [roomType, labels] of Object.entries(common)) {
    await db.roomTypeTask.createMany({ data: labels.map((label, i) => ({ roomType, label, sortOrder: i })) });
  }

  const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // Residential client w/ a traced home layout
  const johnson = await db.client.create({ data: { name: "Johnson Family", contactName: "Beth Johnson", email: "beth.johnson@example.test", phone: "555-3300" } });
  // Residential: standard + deep priced; maintenance left unpriced to show the "no price" state.
  await db.clientRate.createMany({ data: [{ clientId: johnson.id, serviceTypeId: svc.std.id, price: 210 }, { clientId: johnson.id, serviceTypeId: svc.deep.id, price: 465 }] });
  const home = await db.location.create({ data: { name: "Johnson Residence", address: "4512 W 112th Terrace, Leawood, KS", latitude: 38.9192, longitude: -94.6266, clientId: johnson.id, accessNotes: "Garage code 2291. Dog (Biscuit) is friendly – keep back gate closed." } });
  const homeLayout = await db.layout.create({ data: { name: "Main floor", locationId: home.id, aspect: 1.6 } });
  const homeRooms = [
    { name: "Kitchen", type: "Kitchen", points: rect(4, 6, 36, 40), color: "#f59e0b", customTasks: ["Clean inside fridge (1st Mon of month)", "Wipe dog bowl area"] },
    { name: "Living Room", type: "Living Area", points: rect(40, 6, 34, 52), color: "#3b82f6", customTasks: ["Dust piano – dry cloth only"] },
    { name: "Primary Bedroom", type: "Bedroom", points: rect(74, 6, 22, 44), color: "#8b5cf6", customTasks: [] },
    { name: "Primary Bath", type: "Bathroom", points: rect(74, 50, 22, 24), color: "#10b981", customTasks: ["Clean glass shower door w/ squeegee"] },
    { name: "Hallway", type: "Hallway", points: [[4, 46], [40, 46], [40, 58], [74, 58], [74, 66], [4, 66]], color: "#64748b", customTasks: [] },
    { name: "Kids Bedroom", type: "Bedroom", points: rect(4, 66, 30, 28), color: "#ec4899", customTasks: ["Pick up toys into bins"] },
    { name: "Hall Bath", type: "Bathroom", points: rect(34, 66, 18, 28), color: "#14b8a6", customTasks: [] },
    { name: "Entry", type: "Entry", points: rect(52, 66, 22, 28), color: "#a855f7", customTasks: [] },
  ];
  const createdHomeRooms = [];
  for (const r of homeRooms) createdHomeRooms.push(await db.room.create({ data: { ...r, layoutId: homeLayout.id } }));

  // Commercial layout
  const dentLayout = await db.layout.create({ data: { name: "Main floor", locationId: L1.id, aspect: 1.6 } });
  for (const r of [
    { name: "Reception & Waiting", type: "Entry", points: rect(4, 6, 40, 40), color: "#3b82f6", customTasks: ["Sanitize clipboard pens", "Straighten magazines"] },
    { name: "Operatories 1-3", type: "Operatory", points: rect(44, 6, 52, 40), color: "#ef4444", customTasks: [] },
    { name: "Restrooms", type: "Bathroom", points: rect(4, 46, 24, 48), color: "#10b981", customTasks: [] },
    { name: "Break Room", type: "Kitchen", points: rect(28, 46, 30, 48), color: "#f59e0b", customTasks: ["Run & empty dishwasher"] },
    { name: "Offices", type: "Office", points: rect(58, 46, 38, 48), color: "#8b5cf6", customTasks: [] },
  ]) await db.room.create({ data: { ...r, layoutId: dentLayout.id } });

  const std = (labels: string[]) => labels.map((label) => ({ label, done: false }));
  await db.assignment.createMany({
    data: [
      { locationId: L1.id, userId: s1.id, createdById: manager.id, date: day(0), startTime: "18:00", endTime: "21:00", tasks: std(["Restrooms", "Operatories", "Trash & recycling", "Vacuum waiting room", "Mop hard floors"]) },
      { locationId: L2.id, userId: s2.id, createdById: manager.id, date: day(0), startTime: "04:30", endTime: "08:30", tasks: std(["Lobby standard", "Floor 2 offices", "Floor 3 offices", "Kitchenettes", "Restrooms"]) },
      { locationId: L3.id, userId: s1.id, createdById: manager.id, date: day(1), startTime: "18:30", endTime: "20:30", tasks: std(["Restrooms", "Operatories", "Trash"]) },
      { locationId: L2.id, userId: null, createdById: manager.id, date: day(2), startTime: "04:30", tasks: std(["Lobby standard", "Floor 2", "Floor 3"]), notes: "Open shift – needs coverage" },
    ],
  });

  // past week of completed work + time entries for payroll / invoicing
  for (let i = 1; i <= 6; i++) {
    for (const [loc, u, start, hrs] of [[L1, s1, 18, 3], [L2, s2, 4, 4]] as const) {
      const d = day(-i);
      const a = await db.assignment.create({
        data: { locationId: loc.id, userId: u.id, createdById: manager.id, date: d, startTime: `${String(start).padStart(2, "0")}:00`, status: "COMPLETED", tasks: std(["Standard clean"]).map((t) => ({ ...t, done: true })) },
      });
      const inAt = new Date(d.getTime() + start * 3600_000 + 6 * 3600_000);
      const outAt = new Date(inAt.getTime() + hrs * 3600_000 + (i % 3) * 600_000);
      await db.timeEntry.create({ data: { userId: u.id, assignmentId: a.id, clockIn: inAt, clockOut: outAt, approved: i > 2 } });
      await db.checkin.create({ data: { type: "SITE_IN", userId: u.id, locationId: loc.id, assignmentId: a.id, latitude: loc.latitude, longitude: loc.longitude, distanceM: 12, withinFence: true, at: inAt } });
      await db.checkin.create({ data: { type: "SITE_OUT", userId: u.id, locationId: loc.id, assignmentId: a.id, latitude: loc.latitude, longitude: loc.longitude, distanceM: i === 3 ? 900 : 20, withinFence: i !== 3, at: outAt } });
    }
  }

  // Home job today for staff + history w/ room timers (drives the time-by-room report)
  await db.assignment.create({ data: { locationId: home.id, userId: s1.id, createdById: manager.id, date: day(0), startTime: "10:00", endTime: "13:00", tasks: std(["Walk-through with homeowner note", "All rooms per map"]) } });
  const roomMinutes: Record<string, number> = { Kitchen: 38, "Living Room": 22, "Primary Bedroom": 18, "Primary Bath": 27, Hallway: 8, "Kids Bedroom": 20, "Hall Bath": 15, Entry: 6 };
  for (const i of [7, 14, 21]) {
    const d = day(-i);
    const a = await db.assignment.create({ data: { locationId: home.id, userId: s1.id, createdById: manager.id, date: d, startTime: "10:00", status: "COMPLETED", tasks: std(["All rooms per map"]).map((t) => ({ ...t, done: true })) } });
    let t = new Date(d.getTime() + 16 * 3600_000);
    await db.timeEntry.create({ data: { userId: s1.id, assignmentId: a.id, clockIn: t, clockOut: new Date(t.getTime() + 165 * 60_000), approved: true } });
    for (const r of createdHomeRooms) {
      const mins = roomMinutes[r.name] + ((i * r.name.length) % 7) - 3;
      const end = new Date(t.getTime() + mins * 60_000);
      await db.roomSession.create({ data: { assignmentId: a.id, roomId: r.id, userId: s1.id, startedAt: t, endedAt: end } });
      t = new Date(end.getTime() + 2 * 60_000);
    }
  }

  // Mix of services: most standard, some deep / maintenance.
  await db.assignment.updateMany({ where: { serviceTypeId: null }, data: { serviceTypeId: svc.std.id } });
  const past = await db.assignment.findMany({ where: { status: "COMPLETED" }, orderBy: { date: "asc" } });
  const brickPast = past.filter((a) => a.locationId === L2.id);
  const homePast = past.filter((a) => a.locationId === home.id);
  await db.assignment.update({ where: { id: brickPast[0].id }, data: { serviceTypeId: svc.deep.id } });
  await db.assignment.updateMany({ where: { id: { in: past.filter((a) => a.locationId === L1.id).slice(0, 2).map((a) => a.id) } }, data: { serviceTypeId: svc.maint.id } });
  await db.assignment.update({ where: { id: homePast[0].id }, data: { serviceTypeId: svc.deep.id } });
  await db.assignment.update({ where: { id: homePast[1].id }, data: { serviceTypeId: svc.maint.id } }); // unpriced for Johnson
  const upcoming = await db.assignment.findFirst({ where: { locationId: L3.id, status: "SCHEDULED" } });
  if (upcoming) await db.assignment.update({ where: { id: upcoming.id }, data: { serviceTypeId: svc.maint.id } });

  await db.issue.create({ data: { title: "Broken soap dispenser – men's room", detail: "Dispenser cover cracked, needs replacement.", locationId: L2.id, reportedById: s2.id } });
  await db.announcement.create({ data: { title: "Welcome to the new KS app!", body: "Check in at supply pickup and on arrival at every site. Questions? Ask Marcus." } });
  console.log("Seeded. Logins (password123): owner@ks.test, manager@ks.test, staff@ks.test, devon@ks.test", owner.id ? "" : "");
}

main().finally(() => db.$disconnect());
