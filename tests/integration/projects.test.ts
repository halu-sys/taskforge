import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createProject, renameProject, archiveProject, listProjects } from "@/server/services/projects";
import { ForbiddenError } from "@/server/errors";

const prisma = new PrismaClient();
let orgId: string, owner: string, member: string, outsider: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["proj-test", "proj-other"] } } });
  await prisma.user.deleteMany({ where: { email: { in: ["o@proj.test", "m@proj.test", "x@proj.test"] } } });
  const mk = (e: string) => prisma.user.create({ data: { email: e, name: e, passwordHash: "x" } });
  owner = (await mk("o@proj.test")).id;
  member = (await mk("m@proj.test")).id;
  outsider = (await mk("x@proj.test")).id;
  const org = await prisma.organization.create({
    data: { name: "Proj Test", slug: "proj-test",
      memberships: { create: [
        { userId: owner, role: "OWNER" },
        { userId: member, role: "MEMBER" },
      ] } },
  });
  orgId = org.id;
});

describe("projects", () => {
  it("MEMBER can create; outsider cannot", async () => {
    const p = await createProject(orgId, member, "Alpha Project");
    expect(p.key).toMatch(/^[A-Z0-9]+-\d+$/);
    expect(p.nextNumber).toBe(1);
    await expect(createProject(orgId, outsider, "Nope")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keys unique per org, sequential", async () => {
    const p2 = await createProject(orgId, member, "Beta");
    const p3 = await createProject(orgId, member, "Alpha Project");
    expect(p2.key).not.toBe(p3.key);
  });

  it("rename requires ADMIN; member rejected", async () => {
    const p = await prisma.project.findFirstOrThrow({ where: { orgId, name: "Alpha Project" } });
    await expect(renameProject(orgId, member, p.id, "Renamed")).rejects.toBeInstanceOf(ForbiddenError);
    const r = await renameProject(orgId, owner, p.id, "Renamed");
    expect(r.name).toBe("Renamed");
  });

  it("archive hides from listProjects", async () => {
    const p = await prisma.project.findFirstOrThrow({ where: { orgId, name: "Beta" } });
    await archiveProject(orgId, owner, p.id);
    const list = await listProjects(orgId, member);
    expect(list.some((x) => x.id === p.id)).toBe(false);
  });

  it("cross-org project access forbidden", async () => {
    const other = await prisma.organization.create({
      data: { name: "Other", slug: "proj-other", memberships: { create: { userId: outsider, role: "OWNER" } } },
    });
    const p = await prisma.project.findFirstOrThrow({ where: { orgId } });
    await expect(renameProject(other.id, outsider, p.id, "steal")).rejects.toThrow(/not found/i);
    await prisma.organization.delete({ where: { id: other.id } });
  });
});
