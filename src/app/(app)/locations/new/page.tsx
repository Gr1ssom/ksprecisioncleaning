import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { LocationForm } from "../LocationForm";

export default async function NewLocation() {
  await requireUser("MANAGER");
  const clients = must(await admin().from("Client").select("id, name").order("name"), "clients") as { id: string; name: string }[];
  return (<><PageHeader title="New location" /><div className="card max-w-2xl"><LocationForm clients={clients} /></div></>);
}
