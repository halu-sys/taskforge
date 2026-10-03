import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, resolveSession } from "@/server/auth/session";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: ["a@test.dev", "a2@test.dev"] } } });
});

describe("auth integration", () => {
  it("register -> session -> resolve", async () => {
    const hash = await hashPassword("password123");
    const user = await prisma.user.create({
      data: { email: "a@test.dev", name: "A", passwordHash: hash },
    });
    const { token } = await createSession(user.id);
    const s = await resolveSession(token);
    expect(s?.userId).toBe(user.id);
    expect(await verifyPassword("password123", user.passwordHash)).toBe(true);
  });

  it("wrong password rejected", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "a@test.dev" } });
    expect(await verifyPassword("nope", u.passwordHash)).toBe(false);
  });

  it("duplicate email rejected", async () => {
    await expect(
      prisma.user.create({
        data: { email: "a@test.dev", name: "Dup", passwordHash: "x" },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });
});
