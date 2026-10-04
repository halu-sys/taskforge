import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { listProjects } from "@/server/services/projects";
import { getLimits } from "@/server/services/entitlements";
import Link from "next/link";
import { createProjectAction } from "@/server/services/project-actions";
import ActivityFeed from "@/components/ActivityFeed";

export default async function OrgSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: session.userId } },
  });
  if (!membership) redirect("/org");
  const projects = await listProjects(org.id, session.userId);
  const limits = await getLimits(org.id);
  const atProjectLimit = projects.filter((p) => !p.archivedAt).length >= limits.maxProjects;

  return (
    <main className="page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="h1">{org.name}</h1>
        <div className="flex gap-2">
          <Link href={`/org/${slug}/members`} className="btn">Members</Link>
          <Link href={`/org/${slug}/billing`} className="btn">Billing</Link>
        </div>
      </div>

      {atProjectLimit && (
        <div className="banner-warn mb-6">
          The {limits.planName} plan allows {limits.maxProjects} projects.{" "}
          <Link href={`/org/${slug}/billing`} className="font-medium underline">Upgrade</Link> to create more.
        </div>
      )}

      <form action={createProjectAction.bind(null, org.id)} className="flex gap-2 mb-8">
        <input name="name" required placeholder="New project name"
          className="input w-64" />
        <button className="btn btn-primary">Create project</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {projects.map((p) => (
          <Link key={p.id} href={`/org/${slug}/projects/${p.key}`}
            className="card p-4 hover:shadow-lg transition-shadow">
            <div className="font-mono text-xs faint">{p.key}</div>
            <div className="font-semibold mt-1">{p.name}</div>
            <div className="text-xs faint mt-2">{p._count.boards} board(s)</div>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="muted">No projects yet — create one above.</p>
        )}
      </div>

      <ActivityFeed orgId={org.id} userId={session.userId} />
    </main>
  );
}
