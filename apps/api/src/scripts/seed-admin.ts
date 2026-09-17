/**
 * Provisions the first ADMIN account out-of-band. Admin is never self-assigned
 * through the public registration endpoint.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='StrongPass123' npm run seed:admin -w apps/api
 */
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "EnerMesh Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters with upper, lower and numeric characters");
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN", isActive: true, passwordHash },
    });
    console.log(`Promoted existing account to ADMIN and reset its password: ${email}`);
  } else {
    await prisma.user.create({
      data: { email, passwordHash, displayName, role: "ADMIN" },
    });
    console.log(`Created ADMIN account: ${email}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
