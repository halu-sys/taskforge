import { redirect } from "next/navigation";
import { currentSession } from "@/server/auth/session";

export default async function Home() {
  const session = await currentSession();
  redirect(session ? "/org" : "/login");
}
