// Usage: npm run create-owner -- "Full Name" owner@example.com 'a-strong-password'
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 8) {
  console.error('Usage: npm run create-owner -- "Full Name" email password(8+ chars)');
  process.exit(1);
}
const db = new PrismaClient();
db.user
  .upsert({
    where: { email: email.toLowerCase() },
    create: { name, email: email.toLowerCase(), role: "OWNER", passwordHash: bcrypt.hashSync(password, 10) },
    update: { name, role: "OWNER", active: true, passwordHash: bcrypt.hashSync(password, 10) },
  })
  .then((u) => console.log(`Owner ready: ${u.email}`))
  .finally(() => db.$disconnect());
