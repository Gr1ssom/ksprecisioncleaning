import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { LocationForm } from "../LocationForm";

export default async function NewLocation() {
  await requireUser("MANAGER");
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return (<><PageHeader title="New location" /><div className="card max-w-2xl"><LocationForm clients={clients} /></div></>);
}
