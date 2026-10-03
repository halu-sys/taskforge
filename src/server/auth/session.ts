import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/server/db";

export const SESSION_COOKIE = "tf_session";
const SESSION_DAYS = 30;

export async function createSession(
  userId: string,
  expiresAt?: Date,
): Promise<{ token: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const exp =
    expiresAt ?? new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, token, expiresAt: exp } });
  return { token };
}

export async function resolveSession(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  const s = await prisma.session.findUnique({ where: { token } });
  if (!s || s.expiresAt < new Date()) return null;
  return { userId: s.userId, sessionId: s.id };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function currentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
}
