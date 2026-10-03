import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, resolveSession, revokeSession } from "@/server/auth/session";

const prisma = new PrismaClient();

describe("password", () => {
  it("hash/verify round-trip", async () => {
    const h = await hashPassword("s3cret-pw");
    expect(h).not.toContain("s3cret-pw");
    expect(await verifyPassword("s3cret-pw", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("session", () => {
  let userId: string;
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: "sess@test.dev" } });
    const u = await prisma.user.create({
      data: { email: "sess@test.dev", name: "S", passwordHash: "x" },
    });
    userId = u.id;
  });

  it("create -> resolve -> revoke", async () => {
    const { token } = await createSession(userId);
    const s = await resolveSession(token);
    expect(s?.userId).toBe(userId);
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it("expired session rejected", async () => {
    const { token } = await createSession(userId, new Date(Date.now() - 1000));
    expect(await resolveSession(token)).toBeNull();
  });
});
