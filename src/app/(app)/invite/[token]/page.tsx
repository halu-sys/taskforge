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
      <main className="page-narrow mt-16">
        <div className="card p-6">
          <h1 className="h1">Invitation not valid</h1>
          <p className="muted mt-2">This invite link is expired, revoked, or already used.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow mt-16">
      <div className="card p-6">
        <h1 className="h1">Join {inv.org.name}</h1>
        <p className="muted mt-2">
          You have been invited as <b className="text-inherit">{inv.role}</b>.
        </p>
        <form action={acceptInvitationAction.bind(null, token)} className="mt-4">
          <button className="btn btn-primary">Accept invitation</button>
        </form>
      </div>
    </main>
  );
}
