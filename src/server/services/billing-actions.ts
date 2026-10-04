"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { checkout } from "@/server/services/checkout";
import { setCancelAtPeriodEnd, resume, changeSeats, renewSubscription } from "@/server/services/subscriptions";
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
  revalidatePath(`/org/${slug}/billing`, "layout");
  redirect(`/org/${slug}/billing?ok=Subscribed`);
}

export async function cancelAtPeriodEndAction(slug: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  try {
    await setCancelAtPeriodEnd(orgId, session.userId, true);
  } catch (e) {
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof AppError ? e.message : "Action failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`, "layout");
}

export async function resumeAction(slug: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  try {
    await resume(orgId, session.userId);
  } catch (e) {
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof AppError ? e.message : "Action failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`, "layout");
}

export async function retryPaymentAction(slug: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  const card = String(fd.get("card") ?? "").replace(/\s+/g, "");
  try {
    const res = await renewSubscription(orgId, session.userId, new FakeProvider(), { retryCard: card });
    if (res.outcome === "failed") redirect(`/org/${slug}/billing?error=${encodeURIComponent("Card still declined")}`);
  } catch (e) {
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof AppError ? e.message : "Retry failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`, "layout");
}

export async function changeSeatsAction(slug: string, fd: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const orgId = await orgIdFor(slug);
  if (!orgId) redirect("/org");
  const seats = parseInt(String(fd.get("seats") ?? ""), 10);
  const card = String(fd.get("card") ?? "").replace(/\s+/g, "");
  try {
    if (Number.isInteger(seats)) {
      await changeSeats(orgId, session.userId, seats, new FakeProvider(), card || undefined);
    }
  } catch (e) {
    redirect(`/org/${slug}/billing?error=${encodeURIComponent(e instanceof AppError ? e.message : "Seat change failed")}`);
  }
  revalidatePath(`/org/${slug}/billing`, "layout");
}
