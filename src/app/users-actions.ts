"use server";
import { getCurrentUser } from "@/lib/session";
import { inviteUser, savePrefs, setUserRole, setUserStatus, updateProfile } from "@/lib/users";
import { setCurrency, setTheme } from "./actions";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function inviteUserAction(payload: unknown) { return inviteUser(await who(), payload); }
export async function setUserRoleAction(id: string, role: string) { return setUserRole(await who(), String(id), String(role)); }
export async function setUserStatusAction(id: string, status: string) { return setUserStatus(await who(), String(id), String(status)); }
export async function updateProfileAction(payload: unknown) { return updateProfile(await who(), payload); }
/** Save preferences, and apply the theme and currency to this browser straight away. */
export async function savePrefsAction(payload: unknown) {
  const r = await savePrefs(await who(), payload);
  if (r.ok) { await setTheme(r.prefs.theme ?? "system"); if (r.prefs.currency) await setCurrency(r.prefs.currency); }
  return r;
}
