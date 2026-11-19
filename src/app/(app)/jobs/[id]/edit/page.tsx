import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JobForm } from "../../JobForm";

export default async function EditJob({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const [job, locations, staff] = await Promise.all([
    db.assignment.findUnique({ where: { id } }),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!job) notFound();
  return (<><PageHeader title="Edit job" /><JobForm locations={locations} staff={staff} job={job} /></>);
}
