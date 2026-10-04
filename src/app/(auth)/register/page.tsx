"use client";

import { useActionState } from "react";
import { registerFormAction } from "@/server/auth/form-actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerFormAction, null);
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <div className="text-center mb-6">
        <div className="text-2xl font-bold tracking-tight mb-1">TaskForge</div>
        <p className="muted text-sm">Create your account — free plan, no card needed</p>
      </div>
      <form action={formAction} className="card p-6 flex flex-col gap-3">
        <input name="name" required placeholder="Your name" className="input" autoFocus />
        <input name="email" type="email" required placeholder="Email" className="input" />
        <input name="password" type="password" required minLength={8}
          placeholder="Password (min 8 chars)" className="input" />
        <button disabled={pending} className="btn btn-primary justify-center disabled:opacity-50">
          Create account
        </button>
        {state?.error && <p className="banner-danger">{state.error}</p>}
      </form>
      <p className="mt-4 text-sm muted text-center">
        Have an account? <a className="link" href="/login">Sign in</a>
      </p>
    </main>
  );
}
