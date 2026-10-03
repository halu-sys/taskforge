"use client";

import { useActionState } from "react";
import { registerFormAction } from "@/server/auth/form-actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerFormAction, null);
  return (
    <main className="mx-auto mt-24 max-w-sm">
      <h1 className="text-2xl font-bold mb-4">Create your account</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="name" required placeholder="Your name" className="border p-2 rounded" />
        <input name="email" type="email" required placeholder="Email" className="border p-2 rounded" />
        <input name="password" type="password" required minLength={8}
          placeholder="Password (min 8 chars)" className="border p-2 rounded" />
        <button disabled={pending} className="bg-black text-white p-2 rounded disabled:opacity-50">
          Create account
        </button>
        {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
      </form>
      <p className="mt-4 text-sm">
        Have an account? <a className="underline" href="/login">Sign in</a>
      </p>
    </main>
  );
}
