"use server";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { isLowRating } from "@/lib/quality";
import { leads, notify } from "@/lib/notify";

/**
 * A client's rating of one visit, from the visit report page (no sign-in). The report token is the
 * only key: it opens that one visit and nothing else. One rating per visit; sending again updates it.
 */
export async function submitFeedback(token: string, form: FormData) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) redirect("/");
  const sb = admin();
  const rep = must(await sb.from("VisitReport").select("assignmentId").eq("token", token).maybeSingle(), "report") as { assignmentId: string } | null;
  if (!rep) redirect("/");
  const rating = Math.round(Number(form.get("rating")));
  if (!(rating >= 1 && rating <= 5)) redirect(`/r/${token}?error=rating`);
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000) || null;
  const a = must(await sb.from("Assignment").select("id, userId, locationId, date, location:Location(name)").eq("id", rep.assignmentId).single(), "visit") as unknown as { id: string; userId: string | null; locationId: string; date: string; location: { name: string } };
  must(await sb.from("VisitFeedback").upsert({
    assignmentId: a.id, rating, comment, cleanerId: a.userId, locationId: a.locationId, updatedAt: new Date().toISOString(),
  }, { onConflict: "assignmentId" }), "save rating");

  if (isLowRating(rating)) {
    // A complaint: one open issue per visit (kept up to date), so a manager can book a re-clean.
    const title = `Client rated ${rating}/5: ${a.location.name}`;
    const open = must(await sb.from("Issue").select("id").eq("assignmentId", a.id).eq("source", "CLIENT").eq("status", "OPEN").limit(1), "complaint") as { id: string }[];
    if (open.length) must(await sb.from("Issue").update({ title, detail: comment }).eq("id", open[0].id), "update complaint");
    else must(await sb.from("Issue").insert({ title, detail: comment, locationId: a.locationId, assignmentId: a.id, source: "CLIENT", reportedById: null }), "log complaint");
    await notify(await leads("both"), {
      kind: "feedback", title: `Low rating: ${a.location.name} (${rating}/5)`,
      body: comment ? `“${comment.slice(0, 140)}”` : "No comment left. Book a re-clean from Issues if needed.",
      url: "/issues", dedupe: `feedback:${a.id}:${rating}`,
    });
  }
  redirect(`/r/${token}?thanks=1`);
}
