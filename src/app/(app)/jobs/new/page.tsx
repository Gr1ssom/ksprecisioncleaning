import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { serviceTypes } from "@/lib/pricing";
import { JobForm } from "../JobForm";

type Opt = { id: string; name: string };

export default async function NewJob({ searchParams }: { searchParams: Promise<{ locationId?: string; date?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const sb = admin();
  const [locations, staff, services] = await Promise.all([
    sb.from("Location").select("id, name").eq("active", true).order("name"),
    sb.from("User").select("id, name").eq("active", true).order("name"),
    serviceTypes(),
  ]);
  return (
    <>
      <PageHeader title="New job" />
      <JobForm locations={must(locations, "locations") as Opt[]} staff={must(staff, "team") as Opt[]} serviceTypes={services} defaults={sp} />
    </>
  );
}
