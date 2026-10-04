import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { search } from "@/server/services/search";
import Link from "next/link";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");

  let results = { tasks: [] as Awaited<ReturnType<typeof search>>["tasks"], projects: [] as Awaited<ReturnType<typeof search>>["projects"] };
  let error = false;
  try {
    results = await search(org.id, session.userId, q);
  } catch {
    error = true;
  }

  return (
    <main className="page-narrow">
      <h1 className="h1 mb-4">Search {q && <span className="muted font-normal">“{q}”</span>}</h1>
      {error && <p className="banner-danger mb-4">Not a member of this org.</p>}
      <section className="mb-6">
        <h2 className="h2 mb-2">Projects ({results.projects.length})</h2>
        <ul className="text-sm space-y-1.5">
          {results.projects.map((p) => (
            <li key={p.id}>
              <Link className="link" href={`/org/${slug}/projects/${p.key}`}>
                <span className="font-mono faint mr-2">{p.key}</span>{p.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="h2 mb-2">Tasks ({results.tasks.length})</h2>
        <ul className="text-sm space-y-1.5">
          {results.tasks.map((t) => (
            <li key={t.id}>
              <Link className="link" href={`/org/${slug}/tasks/${t.id}`}>
                <span className="font-mono faint mr-2">{t.board.project.key}-{t.number}</span>{t.title}
              </Link>
            </li>
          ))}
        </ul>
        {q && results.tasks.length === 0 && results.projects.length === 0 && (
          <p className="muted text-sm mt-2">No matches.</p>
        )}
      </section>
    </main>
  );
}
