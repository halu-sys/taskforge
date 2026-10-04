"use server";

import { revalidatePath } from "next/cache";
import { currentSession } from "@/server/auth/session";
import { markAllRead } from "@/server/services/notifications";

export async function markAllReadAction(): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  await markAllRead(session.userId);
  revalidatePath("/org");
}
