"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { listNotifications, markRead, setPrefs, unreadCount } from "@/lib/notify";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
const lang = (l: string) => z.enum(["en", "ar"]).parse(l);
export async function latestNotificationsAction(locale: string) { const u = await who(); return { items: await listNotifications(u, lang(locale), { limit: 8 }), unread: await unreadCount(u) }; }
export async function unreadCountAction() { return unreadCount(await who()); }
export async function markReadAction(ids: string[] | "all") { return markRead(await who(), ids === "all" ? "all" : z.array(z.string().max(40)).max(200).parse(ids)); }
export async function setPrefsAction(prefs: unknown) { return setPrefs(await who(), prefs); }
