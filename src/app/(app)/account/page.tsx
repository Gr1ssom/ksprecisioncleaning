import { requireUser } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import { Badge, PageHeader } from "@/components/ui";
import { ROLE_INFO } from "@/lib/team";
import { PasswordForm, TwoStep } from "./AccountForms";

export const dynamic = "force-dynamic";

export default async function Account() {
  const me = await requireUser();
  const sb = await authClient();
  const { data } = await sb.auth.mfa.listFactors();
  const factor = data?.totp?.[0] ?? null;
  return (
    <>
      <PageHeader title="My account" subtitle={me.email} action={<Badge value={me.role} label={ROLE_INFO[me.role].label.toLowerCase()} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Change password</h2>
          <PasswordForm />
        </section>
        <section className="card">
          <h2 className="h2 mb-1">2-step sign-in</h2>
          <p className="muted mb-3">
            {me.role === "OWNER" ? "Strongly recommended for the owner: your login can see pay rates and payroll. " : ""}
            After your password, you&apos;ll enter a code from an authenticator app on your phone.
          </p>
          <TwoStep enabledFactorId={factor?.id ?? null} />
        </section>
      </div>
    </>
  );
}
