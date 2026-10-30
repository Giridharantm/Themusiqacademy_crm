"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth-actions";
import { BrandLockup } from "@/components/brand";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1><BrandLockup large /></h1>
          <p className="text-sm text-page/70 mt-4">Sign in to your account</p>
        </div>
        <form action={formAction} className="bg-white border border-line border-t-2 border-t-gold rounded-xl shadow-lg p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">Email or phone number</span>
            <input
              name="email"
              type="text"
              autoComplete="username"
              required
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="you@example.com or 98450 12345"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">Password</span>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-accent text-white rounded-md py-2 text-sm font-medium hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
