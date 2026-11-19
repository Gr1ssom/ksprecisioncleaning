import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JobForm } from "../JobForm";

export default async function NewJob({ searchParams }: { searchParams: Promise<{ locationId?: string; date?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const [locations, staff] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (<><PageHeader title="New job" /><JobForm locations={locations} staff={staff} defaults={sp} /></>);
}
