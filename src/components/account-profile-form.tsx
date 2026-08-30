"use client";

import { useActionState } from "react";
import { updateProfileAction, type AccountActionState } from "@/lib/actions/auth-actions";
import { Input, Button } from "@/components/ui";

const initialState: AccountActionState = { status: "idle" };

export function AccountProfileForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.status !== "idle" && (
        <div
          className={`text-sm rounded-md px-3 py-2 border ${
            state.status === "success"
              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {state.message}
        </div>
      )}
      <Input label="Name" name="name" defaultValue={name} required />
      <Input label="Email" name="email" defaultValue={email} disabled hint="Contact an admin to change your email." />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
