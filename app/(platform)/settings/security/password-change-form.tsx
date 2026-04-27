"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/(platform)/settings/security/actions";

type PasswordChangeState = {
  error: string;
  success: string;
};

export function PasswordChangeForm() {
  const initialState: PasswordChangeState = {
    error: "",
    success: "",
  };

  const [state, formAction, pending] = useActionState(
    changePassword,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Password
        </p>
        <h2 className="text-xl font-semibold text-neutral-950">Change Password</h2>
        <p className="text-sm leading-6 text-neutral-600">
          Your password is stored as a secure hash. Updating it revokes every other active session.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">New password</span>
          <input
            name="newPassword"
            type="password"
            minLength={8}
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Confirm new password</span>
          <input
            name="confirmPassword"
            type="password"
            minLength={8}
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>
      </div>

      {state.error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}
