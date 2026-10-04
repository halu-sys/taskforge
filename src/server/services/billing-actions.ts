"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { checkout } from "@/server/services/checkout";
import { setCancelAtPeriodEnd, resume, changeSeats } from "@/server/services/subscriptions";
import { FakeProvider } from "@/server/billing/provider";
import { AppError } from "@/server/errors";

async function orgIdFor(slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug } });
  return org?.id ?? null;
}

export async function checkoutAction(slug: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  const plan = String(fd.get("plan") ?? "");
  const card = String(fd.get("card") ?? "").replace(/\s+/g, "");
  try {
    await checkout(orgId, session.userId, plan, card, new FakeProvider());
  } catch (e) {
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof AppError ? e.message : "Checkout failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`);
  redirect(`/org/${slug}/billing?ok=Subscribed`);
}

export async function cancelAtPeriodEndAction(slug: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  await setCancelAtPeriodEnd(orgId, session.userId, true);
  revalidatePath(`/org/${slug}/billing`);
}

export async function resumeAction(slug: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  await resume(orgId, session.userId);
  revalidatePath(`/org/${slug}/billing`);
}

export async function changeSeatsAction(slug: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  const seats = parseInt(String(fd.get("seats") ?? ""), 10);
  const card = String(fd.get("card") ?? "4242424242424242").replace(/\s+/g, "");
  try {
    if (Number.isInteger(seats)) await changeSeats(orgId, session.userId, seats, new FakeProvider(), card);
  } catch (e) {
    revalidatePath(`/org/${slug}/billing`);
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof Error ? e.message : "Seat change failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`);
}
