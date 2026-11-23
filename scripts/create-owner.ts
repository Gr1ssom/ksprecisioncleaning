// Creates (or resets) the owner login in Supabase Auth + their staff profile.
// Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run create-owner -- "Full Name" owner@example.com 'a-strong-password'
// Easier: open the app's /setup page once, before anyone else has signed up.
import { createClient } from "@supabase/supabase-js";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 8) {
  console.error('Usage: npm run create-owner -- "Full Name" email password(8+ chars)');
  process.exit(1);
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

(async () => {
  const lower = email.toLowerCase();
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === lower);
  if (user) {
    const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true, ban_duration: "none" });
    if (error) throw error;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email: lower, password, email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    user = data.user!;
  }
  const { error } = await sb.from("User").upsert({ id: user.id, name, email: lower, role: "OWNER", active: true });
  if (error) throw error;
  console.log(`Owner ready: ${lower}`);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
