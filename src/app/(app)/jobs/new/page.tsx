import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { serviceTypes } from "@/lib/pricing";
import { JobForm } from "../JobForm";
import { jobDefaults, parseTemplate } from "@/lib/templates";
import { today } from "@/lib/format";

type Opt = { id: string; name: string };

export default async function NewJob({ searchParams }: { searchParams: Promise<{ locationId?: string; date?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const sb = admin();
  const [locations, staff, services] = await Promise.all([
    sb.from("Location").select("id, name, jobTemplate").eq("active", true).order("name"),
    sb.from("User").select("id, name").eq("active", true).order("name"),
    serviceTypes(),
  ]);
  const locs = must(locations, "locations") as (Opt & { jobTemplate: unknown })[];
  const team = must(staff, "team") as Opt[];
  // Each location's template, checked against what can still be picked (retired services, old staff).
  const templates = Object.fromEntries(locs.flatMap((l) => {
    const t = parseTemplate(l.jobTemplate);
    if (!t) return [];
    const ok = { ...t, serviceTypeId: services.some((x) => x.id === t.serviceTypeId) ? t.serviceTypeId : null, userId: team.some((u) => u.id === t.userId) ? t.userId : null };
    return [[l.id, jobDefaults(ok, services[0]?.id)]];
  }));
  return (
    <>
      <PageHeader title="New job" />
      <JobForm locations={locs} staff={team} serviceTypes={services} defaults={sp} today={today()} templates={templates} />
    </>
  );
}
