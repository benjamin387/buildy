"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureDefaultRoles } from "@/lib/rbac/default-roles";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/security/password";
import { redirect } from "next/navigation";

const bootstrapSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function bootstrapAdmin(formData: FormData) {
  const parsed = bootstrapSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    throw new Error("Invalid setup form.");
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    const user = await getSessionUser();
    redirect(user ? "/projects" : "/login");
  }

  await ensureDefaultRoles();
  const adminRole = await prisma.role.findUnique({ where: { key: "ADMIN" } });
  if (!adminRole) throw new Error("Missing ADMIN role.");

  const digest = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: digest.hashBase64,
      passwordSalt: digest.saltBase64,
      roles: {
        create: {
          roleId: adminRole.id,
        },
      },
    },
  });

  await prisma.auditEvent.create({
    data: {
      module: "auth",
      action: "bootstrap_admin",
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    },
  });

  await createSession(user.id);
  redirect("/projects");
}
