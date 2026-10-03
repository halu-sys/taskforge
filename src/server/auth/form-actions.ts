"use server";

import { loginAction, registerAction, type AuthResult } from "@/server/auth/actions";

export async function loginFormAction(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  try {
    await loginAction({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Login failed" };
  }
}

export async function registerFormAction(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  try {
    await registerAction({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Registration failed" };
  }
}
