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
    <main className="p-8 max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Search {q && <span className="text-gray-500">“{q}”</span>}</h1>
      {error && <p className="text-red-600">Not a member of this org.</p>}
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Projects ({results.projects.length})</h2>
        <ul className="text-sm space-y-1">
          {results.projects.map((p) => (
            <li key={p.id}>
              <Link className="underline" href={`/org/${slug}/projects/${p.key}`}>
                <span className="font-mono text-gray-400 mr-2">{p.key}</span>{p.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Tasks ({results.tasks.length})</h2>
        <ul className="text-sm space-y-1">
          {results.tasks.map((t) => (
            <li key={t.id}>
              <Link className="underline" href={`/org/${slug}/tasks/${t.id}`}>
                <span className="font-mono text-gray-400 mr-2">{t.board.project.key}-{t.number}</span>{t.title}
              </Link>
            </li>
          ))}
        </ul>
        {q && results.tasks.length === 0 && results.projects.length === 0 && (
          <p className="text-gray-500 text-sm mt-2">No matches.</p>
        )}
      </section>
    </main>
  );
}
