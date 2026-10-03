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
    <main className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Members — {org.name}</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Name</th><th>Email</th><th>Role</th>
            {canManage && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{m.user.name}</td>
              <td>{m.user.email}</td>
              <td>{m.role}</td>
              {canManage && m.userId !== session.userId && (
                <td className="flex gap-2 py-1">
                  {m.role !== "OWNER" && membership.role === "OWNER" && (
                    <form action={changeRoleAction.bind(null, org.id, m.userId, "ADMIN")}>
                      <button className="underline">Make admin</button>
                    </form>
                  )}
                  {m.role === "ADMIN" && membership.role === "OWNER" && (
                    <form action={changeRoleAction.bind(null, org.id, m.userId, "MEMBER")}>
                      <button className="underline">Demote</button>
                    </form>
                  )}
                  <form action={removeMemberAction.bind(null, org.id, m.userId)}>
                    <button className="text-red-600 underline">Remove</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && (
        <>
          <h2 className="text-lg font-semibold mt-8 mb-2">Invite a teammate</h2>
          <form action={inviteMemberAction.bind(null, org.id)} className="flex gap-2">
            <input name="email" type="email" required placeholder="teammate@email.com"
              className="border p-2 rounded" />
            <select name="role" className="border p-2 rounded">
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button className="bg-black text-white px-4 rounded">Invite</button>
          </form>
          {invitations.length > 0 && (
            <>
              <h3 className="font-semibold mt-6 mb-2">Pending invitations</h3>
              <ul className="text-sm space-y-1">
                {invitations.map((i) => (
                  <li key={i.id} className="flex gap-3 items-center">
                    <span>{i.email} ({i.role})</span>
                    <a className="underline" href={`/invite/${i.token}`}>invite link</a>
                    <form action={revokeInvitationAction.bind(null, org.id, i.id)}>
                      <button className="text-red-600 underline">Revoke</button>
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
