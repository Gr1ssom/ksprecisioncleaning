import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { assignableRoles } from "@/lib/team";
import { EmployeeForm } from "../EmployeeForm";

export default async function NewEmployee() {
  const me = await requireUser("MANAGER");
  return (
    <>
      <PageHeader title="Add employee" subtitle="Creates their login right away. Give them the email and starting password; they sign in from their phone." />
      <div className="card max-w-3xl"><EmployeeForm roles={assignableRoles(me)} showPay={me.role === "OWNER"} /></div>
    </>
  );
}
