import { requireUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { logout } from "../actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <Nav role={user.role} name={user.name} logout={logout} />
      <div className="md:pl-60">
        <main className="mx-auto max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-10">{children}</main>
      </div>
    </div>
  );
}
