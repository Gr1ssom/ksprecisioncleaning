import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { LayoutEditor } from "./LayoutEditor";

export default async function EditLayout({ params }: { params: Promise<{ id: string; layoutId: string }> }) {
  await requireUser("MANAGER");
  const { id, layoutId } = await params;
  const [layout, common] = await Promise.all([
    db.layout.findUnique({ where: { id: layoutId }, include: { rooms: true, location: true } }),
    db.roomTypeTask.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!layout || layout.locationId !== id) notFound();
  const commonTasks: Record<string, string[]> = {};
  for (const c of common) (commonTasks[c.roomType] ??= []).push(c.label);
  const roomTypes = [...new Set([...Object.keys(commonTasks), "Other"])];
  return (
    <>
      <PageHeader title="Floor plan" subtitle={layout.location.name} />
      <LayoutEditor
        locationId={id} roomTypes={roomTypes} commonTasks={commonTasks}
        layout={{
          id: layout.id, name: layout.name, imageData: layout.imageData, aspect: layout.aspect,
          rooms: layout.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, points: r.points as number[][], color: r.color, customTasks: (r.customTasks as string[]) ?? [], notes: r.notes })),
        }}
      />
    </>
  );
}
