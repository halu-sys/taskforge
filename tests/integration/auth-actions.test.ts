import { describe, it, expect, beforeAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      set: (n: string, v: string) => jar.set(n, v),
      get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
      delete: (n: string) => jar.delete(n),
    }),
    _jar: jar,
  };
});
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    redirect: (url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};` });
    },
  };
});

import { registerAction, loginAction, logoutAction } from "@/server/auth/actions";
import { resolveSession } from "@/server/auth/session";

const prisma = new PrismaClient();
const EMAIL = "flow@auth-action.test";

function redirectUrl(e: unknown): string | null {
  const d = (e as { digest?: string })?.digest;
  return typeof d === "string" ? d.split(";")[2] ?? null : null;
}

beforeAll(async () => {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (u) {
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.membership.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
});

describe("auth actions", () => {
  it("register creates user+org+session and redirects", async () => {
    let url: string | null = null;
    try {
      await registerAction({ name: "Flo", email: EMAIL, password: "password123" });
    } catch (e) {
      url = redirectUrl(e);
    }
    expect(url).toMatch(/^\/org\//);
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user).not.toBeNull();
    const m = await prisma.membership.findFirst({ where: { userId: user!.id } });
    expect(m?.role).toBe("OWNER");
    const sessions = await prisma.session.findMany({ where: { userId: user!.id } });
    expect(sessions).toHaveLength(1);
    expect(await resolveSession(sessions[0].token)).not.toBeNull();
  });

  it("duplicate email rejected", async () => {
    const r = await registerAction({ name: "Dup", email: EMAIL, password: "password123" });
    expect(r).toEqual({ ok: false, error: "Email already registered" });
  });

  it("login wrong password rejected; correct login creates session", async () => {
    const bad = await loginAction({ email: EMAIL, password: "wrongpass" });
    expect(bad).toEqual({ ok: false, error: "Invalid email or password" });

    let url: string | null = null;
    try {
      await loginAction({ email: EMAIL, password: "password123" });
    } catch (e) {
      url = redirectUrl(e);
    }
    expect(url).toBe("/org");
    const sessions = await prisma.session.findMany({ where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).id } });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it("logout revokes the session server-side", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const before = await prisma.session.count({ where: { userId: user.id } });
    try {
      await logoutAction();
    } catch (e) {
      expect(redirectUrl(e)).toBe("/login");
    }
    // logoutAction reads the cookie jar set by the previous login
    const after = await prisma.session.count({ where: { userId: user.id } });
    expect(after).toBeLessThan(before);
  });
});
