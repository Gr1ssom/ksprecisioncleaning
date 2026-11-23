import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/server";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function Setup() {
  const { count } = await admin().from("User").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) redirect("/login");
  return <SetupForm />;
}
