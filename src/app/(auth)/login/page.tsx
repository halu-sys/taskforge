"use client";

import { useActionState } from "react";
import { loginFormAction } from "@/server/auth/form-actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginFormAction, null);
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <div className="text-center mb-6">
        <div className="text-2xl font-bold tracking-tight mb-1">TaskForge</div>
        <p className="muted text-sm">Sign in to your workspace</p>
      </div>
      <form action={formAction} className="card p-6 flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email"
          className="input" autoFocus />
        <input name="password" type="password" required placeholder="Password"
          className="input" />
        <button disabled={pending} className="btn btn-primary justify-center disabled:opacity-50">
          Sign in
        </button>
        {state?.error && <p className="banner-danger">{state.error}</p>}
      </form>
      <p className="mt-4 text-sm muted text-center">
        No account? <a className="link" href="/register">Register</a>
      </p>
    </main>
  );
}
