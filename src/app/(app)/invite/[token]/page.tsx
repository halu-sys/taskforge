import { currentSession } from "@/server/auth/session";
import { getInvitationByToken } from "@/server/services/invitations";
import { acceptInvitationAction } from "@/server/services/member-actions";
import { redirect } from "next/navigation";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await currentSession();
  if (!session) redirect(`/login?next=/invite/${token}`);
  const inv = await getInvitationByToken(token);

  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return (
      <main className="p-8 max-w-md mx-auto mt-16">
        <h1 className="text-xl font-bold">Invitation not valid</h1>
        <p className="text-gray-500 mt-2">This invite link is expired, revoked, or already used.</p>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-md mx-auto mt-16">
      <h1 className="text-xl font-bold">Join {inv.org.name}</h1>
      <p className="text-gray-600 mt-2">
        You have been invited as <b>{inv.role}</b>.
      </p>
      <form action={acceptInvitationAction.bind(null, token)} className="mt-4">
        <button className="bg-black text-white px-4 py-2 rounded">Accept invitation</button>
      </form>
    </main>
  );
}
