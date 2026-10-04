"use client";

import { usePathname } from "next/navigation";

export default function SearchBox() {
  const pathname = usePathname();
  const m = pathname.match(/^\/org\/([^/]+)/);
  const slug = m?.[1];
  if (!slug) return null;
  return (
    <form method="get" action={`/org/${slug}/search`}>
      <input name="q" placeholder="Search…" className="input text-sm py-1 w-40" />
    </form>
  );
}
