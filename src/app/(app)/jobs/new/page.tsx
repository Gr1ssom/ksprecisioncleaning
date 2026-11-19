import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JobForm } from "../JobForm";
import { activeServiceTypes } from "@/lib/pricing";

export default async function NewJob({ searchParams }: { searchParams: Promise<{ locationId?: string; date?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const [locations, staff, serviceTypes] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    activeServiceTypes(),
  ]);
  return (<><PageHeader title="New job" /><JobForm locations={locations} staff={staff} serviceTypes={serviceTypes} defaults={sp} /></>);
}
