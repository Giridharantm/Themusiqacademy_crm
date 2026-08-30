"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth-actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vinyl-teal px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="inline-flex w-12 h-12 rounded-full bg-vinyl-sun text-vinyl-teal items-center justify-center font-display font-bold text-lg mb-3">M</span>
          <h1 className="font-display text-2xl font-semibold text-vinyl-cream">The Musiq Academy</h1>
          <p className="text-sm text-vinyl-cream/70 mt-1">Sign in to your account</p>
        </div>
        <form action={formAction} className="bg-vinyl-paper border-4 border-vinyl-coral rounded-2xl shadow-sm p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}
          <label className="block">
            <span className="block text-sm font-medium text-vinyl-ink mb-1">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-vinyl-border bg-white px-3 py-2 text-sm text-vinyl-ink focus:outline-none focus:ring-2 focus:ring-vinyl-teal"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-vinyl-ink mb-1">Password</span>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-vinyl-border bg-white px-3 py-2 text-sm text-vinyl-ink focus:outline-none focus:ring-2 focus:ring-vinyl-teal"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-vinyl-coral text-white rounded-md py-2 text-sm font-medium hover:bg-vinyl-coral-dark disabled:opacity-50"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
