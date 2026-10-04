import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { listProjects } from "@/server/services/projects";
import Link from "next/link";
import { createProjectAction } from "@/server/services/project-actions";

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

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <Link href={`/org/${slug}/members`} className="text-sm underline">Members</Link>
      </div>

      <form action={createProjectAction.bind(null, org.id)} className="flex gap-2 mb-8">
        <input name="name" required placeholder="New project name"
          className="border p-2 rounded w-64" />
        <button className="bg-black text-white px-4 rounded">Create project</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p.id} href={`/org/${slug}/projects/${p.key}`}
            className="border rounded p-4 hover:shadow">
            <div className="font-mono text-xs text-gray-500">{p.key}</div>
            <div className="font-semibold mt-1">{p.name}</div>
            <div className="text-xs text-gray-500 mt-2">{p._count.boards} board(s)</div>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-gray-500">No projects yet — create one above.</p>
        )}
      </div>
    </main>
  );
}
