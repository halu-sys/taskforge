"use client";

import { usePathname } from "next/navigation";

export default function SearchBox() {
  const pathname = usePathname();
  const m = pathname.match(/^\/org\/([^/]+)/);
  const slug = m?.[1];
  if (!slug) return null;
  return (
    <form method="get" action={`/org/${slug}/search`} className="flex gap-1">
      <input name="q" placeholder="Search…" className="border p-1 rounded text-sm w-40" />
      <button className="underline text-sm">Go</button>
    </form>
  );
}
