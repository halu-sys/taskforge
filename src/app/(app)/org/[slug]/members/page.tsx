import { cookies } from "next/headers";
import { currentSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import { listMembers } from "@/server/services/members";
import { listInvitations } from "@/server/services/invitations";
import { inviteMemberAction, revokeInvitationAction, changeRoleAction, removeMemberAction } from "@/server/services/member-actions";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) redirect("/org");
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: session.userId } },
  });
  if (!membership) redirect("/org");

  const members = await listMembers(org.id, session.userId);
  const canManage = membership.role !== "MEMBER";
  const invitations = canManage ? await listInvitations(org.id, session.userId) : [];

  return (
    <main className="page-narrow">
      <h1 className="h1 mb-6">Members — {org.name}</h1>
      <div className="card overflow-hidden mb-8">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Role</th>
            {canManage && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">{m.user.name}</td>
              <td className="muted">{m.user.email}</td>
              <td><span className={`badge ${m.role === "OWNER" ? "badge-accent" : ""}`}>{m.role}</span></td>
              {canManage && m.userId !== session.userId && (
                <td className="flex gap-1.5">
                  {m.role !== "OWNER" && membership.role === "OWNER" && (
                    <form action={changeRoleAction.bind(null, org.id, m.userId, "ADMIN")}>
                      <button className="btn text-xs py-1">Make admin</button>
                    </form>
                  )}
                  {m.role === "ADMIN" && membership.role === "OWNER" && (
                    <form action={changeRoleAction.bind(null, org.id, m.userId, "MEMBER")}>
                      <button className="btn text-xs py-1">Demote</button>
                    </form>
                  )}
                  <form action={removeMemberAction.bind(null, org.id, m.userId)}>
                    <button className="btn btn-danger text-xs py-1">Remove</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {canManage && (
        <>
          <h2 className="h2 mb-2">Invite a teammate</h2>
          <form action={inviteMemberAction.bind(null, org.id)} className="flex gap-2">
            <input name="email" type="email" required placeholder="teammate@email.com"
              className="input" />
            <select name="role" className="select">
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button className="btn btn-primary">Invite</button>
          </form>
          {invitations.length > 0 && (
            <>
              <h3 className="font-semibold mt-6 mb-2">Pending invitations</h3>
              <ul className="text-sm space-y-1.5">
                {invitations.map((i) => (
                  <li key={i.id} className="flex gap-3 items-center">
                    <span>{i.email} <span className="badge">{i.role}</span></span>
                    <a className="link" href={`/invite/${i.token}`}>invite link</a>
                    <form action={revokeInvitationAction.bind(null, org.id, i.id)}>
                      <button className="btn btn-danger text-xs py-1">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
