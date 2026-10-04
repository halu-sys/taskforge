import { listNotifications, unreadCount } from "@/server/services/notifications";
import { markAllReadAction } from "@/server/services/notification-actions";
import Link from "next/link";

export default async function NotificationBell({ userId }: { userId: string }) {
  const unread = await unreadCount(userId);
  const items = await listNotifications(userId, 10);
  return (
    <div className="relative group">
      <span className="cursor-default">
        Notifications{unread > 0 && (
          <span className="ml-1 bg-red-600 text-white text-xs rounded-full px-1.5">{unread}</span>
        )}
      </span>
      <div className="absolute right-0 top-6 hidden group-hover:block bg-white border rounded shadow w-72 text-sm z-10">
        <div className="p-2 border-b flex justify-between items-center">
          <span className="font-semibold">Latest</span>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button className="underline text-xs">Mark all read</button>
            </form>
          )}
        </div>
        <ul>
          {items.map((n) => (
            <li key={n.id} className={`p-2 border-b last:border-0 ${n.readAt ? "text-gray-400" : ""}`}>
              <Link href={n.link}>{n.verb}</Link>
            </li>
          ))}
          {items.length === 0 && <li className="p-2 text-gray-500">Nothing yet.</li>}
        </ul>
      </div>
    </div>
  );
}
