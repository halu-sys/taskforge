"use server";

import { loginAction, registerAction, type AuthResult } from "@/server/auth/actions";
import { isRedirectError } from "next/server";
import { AppError } from "@/server/errors";

export async function loginFormAction(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  try {
    await loginAction({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    return { ok: true };
  } catch (e: unknown) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof AppError && e.code === "VALIDATION" ? e.message : "Login failed" };
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
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof AppError && e.code === "VALIDATION" ? e.message : "Registration failed" };
  }
}
