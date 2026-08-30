"use client";

import { useActionState, useRef, useEffect } from "react";
import { changePasswordAction, type AccountActionState } from "@/lib/actions/auth-actions";
import { Input, Button } from "@/components/ui";

const initialState: AccountActionState = { status: "idle" };

export function AccountPasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
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
      <Input label="Current password" name="currentPassword" type="password" required />
      <Input label="New password" name="newPassword" type="password" required hint="At least 8 characters." />
      <Input label="Confirm new password" name="confirmPassword" type="password" required />
      <Button type="submit" disabled={pending}>
        {pending ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}
