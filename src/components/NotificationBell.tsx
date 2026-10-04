import { listNotifications, unreadCount } from "@/server/services/notifications";
import { markAllReadAction } from "@/server/services/notification-actions";
import Link from "next/link";

export default async function NotificationBell({ userId }: { userId: string }) {
  const unread = await unreadCount(userId);
  const items = await listNotifications(userId, 10);
  return (
    <div className="relative group">
      <span className="cursor-default btn btn-ghost">
        Notifications{unread > 0 && (
          <span className="badge badge-danger">{unread}</span>
        )}
      </span>
      <div className="absolute right-0 top-9 hidden group-hover:block card w-80 text-sm z-30 overflow-hidden">
        <div className="p-2.5 border-b border-line flex justify-between items-center">
          <span className="font-semibold">Latest</span>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button className="link text-xs">Mark all read</button>
            </form>
          )}
        </div>
        <ul>
          {items.map((n) => (
            <li key={n.id} className={`p-2.5 border-b border-line last:border-0 ${n.readAt ? "faint" : ""}`}>
              <Link href={n.link}>{n.verb}</Link>
            </li>
          ))}
          {items.length === 0 && <li className="p-2.5 muted">Nothing yet.</li>}
        </ul>
      </div>
    </div>
  );
}
