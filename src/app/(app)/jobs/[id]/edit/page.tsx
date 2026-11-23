import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { serviceTypes } from "@/lib/pricing";
import { JobForm } from "../../JobForm";
import type { Assignment } from "@/lib/types";

type Opt = { id: string; name: string };

export default async function EditJob({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const sb = admin();
  const [job, locations, staff, services] = await Promise.all([
    sb.from("Assignment").select("*").eq("id", id).maybeSingle(),
    sb.from("Location").select("id, name").order("name"),
    sb.from("User").select("id, name").eq("active", true).order("name"),
    serviceTypes(false),
  ]);
  const j = must(job, "job") as Assignment | null;
  if (!j) notFound();
  return (
    <>
      <PageHeader title="Edit job" />
      <JobForm locations={must(locations, "locations") as Opt[]} staff={must(staff, "team") as Opt[]}
        serviceTypes={services.filter((t) => t.active || t.id === j.serviceTypeId)} job={j} />
    </>
  );
}
