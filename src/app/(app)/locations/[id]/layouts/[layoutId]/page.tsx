import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { signedUrls } from "@/lib/storage";
import { normalizeTasks } from "@/lib/rooms";
import { serviceTypes } from "@/lib/pricing";
import type { Layout, Location, Room, RoomTypeTask } from "@/lib/types";
import { LayoutEditor } from "./LayoutEditor";

export default async function EditLayout({ params }: { params: Promise<{ id: string; layoutId: string }> }) {
  await requireUser("MANAGER");
  const { id, layoutId } = await params;
  const sb = admin();
  const [lr, cr, services] = await Promise.all([
    sb.from("Layout").select("*, rooms:Room(*), location:Location(name)").eq("id", layoutId).maybeSingle(),
    sb.from("RoomTypeTask").select("*").order("sortOrder"),
    serviceTypes(),
  ]);
  const layout = must(lr, "floor plan") as (Layout & { rooms: Room[]; location: Pick<Location, "name"> }) | null;
  if (!layout || layout.locationId !== id) notFound();
  const common = must(cr, "room tasks") as RoomTypeTask[];
  const commonTasks: Record<string, { label: string; minutes: number | null; serviceTypeIds: string[] }[]> = {};
  for (const c of common) (commonTasks[c.roomType] ??= []).push({ label: c.label, minutes: c.minutes, serviceTypeIds: c.serviceTypeIds });
  const roomTypes = [...new Set([...Object.keys(commonTasks), ...layout.rooms.map((r) => r.type), "Other"])];
  const urls = await signedUrls([layout.imagePath]);
  return (
    <>
      <PageHeader title="Floor plan" subtitle={layout.location.name} />
      <LayoutEditor
        locationId={id} roomTypes={roomTypes} commonTasks={commonTasks} services={services.map((s) => ({ id: s.id, name: s.name }))}
        layout={{
          id: layout.id, name: layout.name, aspect: layout.aspect, imageUrl: layout.imagePath ? urls[layout.imagePath] ?? null : null,
          rooms: [...layout.rooms].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => ({
            id: r.id, name: r.name, type: r.type, points: r.points, color: r.color, customTasks: normalizeTasks(r.customTasks), notes: r.notes,
          })),
        }}
      />
    </>
  );
}
