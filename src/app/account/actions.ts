"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_KEYS, addInvite, createKey, currentUser, deleteUser, endSession, isAdmin, mayUseApi, removeInvite, revokeKey } from "@/lib/auth";

export type KeyState = { key?: string; name?: string; error?: string };

export async function createKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has ended. Sign in again." };
  if (!mayUseApi(user.email)) return { error: "API access is by invitation for now." };
  const name = String(form.get("name") || "").trim() || "My key", key = createKey(user.id, name);
  if (!key) return { error: `You can have ${MAX_KEYS} keys at a time. Revoke one to create another.` };
  revalidatePath("/account");
  return { key, name };
}

export async function revokeKeyAction(form: FormData) {
  const user = await currentUser();
  if (user) revokeKey(user.id, Number(form.get("id")));
  revalidatePath("/account");
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}

export async function deleteAccountAction() {
  const user = await currentUser();
  if (user) { deleteUser(user.id); await endSession(); }
  redirect("/");
}

export async function inviteAction(form: FormData) {
  const user = await currentUser();
  if (user && isAdmin(user.email)) for (const e of String(form.get("emails") || "").split(/[\s,;]+/).filter(Boolean).slice(0, 50)) addInvite(e, user.email);
  revalidatePath("/account");
}

export async function uninviteAction(form: FormData) {
  const user = await currentUser();
  if (user && isAdmin(user.email)) removeInvite(String(form.get("email") || ""));
  revalidatePath("/account");
}
