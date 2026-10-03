"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, setSessionCookie, clearSessionCookie, revokeSession, SESSION_COOKIE } from "@/server/auth/session";
import { cookies } from "next/headers";
import { ValidationError } from "@/server/errors";
import { createOrg } from "@/server/services/orgs";

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
});

export type AuthResult = { ok: boolean; error?: string };

export async function registerAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = credentials
    .extend({ name: z.string().min(1).max(100) })
    .safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid input");
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "Email already registered" };

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });
  const slug = await createOrg(user.id, `${name}'s Workspace`);
  const { token } = await createSession(user.id);
  await setSessionCookie(token);
  redirect(`/org/${slug}`);
}

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = credentials.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid input");
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Invalid email or password" };
  }
  const { token } = await createSession(user.id);
  await setSessionCookie(token);
  redirect("/org");
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  await clearSessionCookie();
  redirect("/login");
}
