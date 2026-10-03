"use client";

import { useActionState } from "react";
import { loginFormAction } from "@/server/auth/form-actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginFormAction, null);
  return (
    <main className="mx-auto mt-24 max-w-sm">
      <h1 className="text-2xl font-bold mb-4">Sign in to TaskForge</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email"
          className="border p-2 rounded" />
        <input name="password" type="password" required placeholder="Password"
          className="border p-2 rounded" />
        <button disabled={pending} className="bg-black text-white p-2 rounded disabled:opacity-50">
          Sign in
        </button>
        {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
      </form>
      <p className="mt-4 text-sm">
        No account? <a className="underline" href="/register">Register</a>
      </p>
    </main>
  );
}
