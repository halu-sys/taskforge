"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE } from "@/server/cookies";

export async function switchOrgAction(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  if (!slug) redirect("/org");
  const store = await cookies();
  store.set(ORG_COOKIE, slug, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect(`/org/${slug}`);
}
