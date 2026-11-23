import { AuthCard } from "@/components/AuthCard";
import { ResetForm } from "./ResetForm";

export default async function Reset({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  return (
    <AuthCard heading={first ? "Choose your password" : "New password"}>
      {first && <p className="text-sm text-slate-600">You signed in with a password someone gave you. Choose your own (8+ characters) to keep going.</p>}
      <ResetForm />
    </AuthCard>
  );
}
