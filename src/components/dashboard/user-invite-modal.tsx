"use client";

import { useRef } from "react";
import { inviteMemberAction } from "@/app/dashboard/settings/actions";

export function UserInviteModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white"
      >
        Invite User
      </button>
      <dialog
        ref={dialogRef}
        className="w-[min(92vw,520px)] rounded-[18px] border border-[rgba(12,17,21,0.12)] bg-white p-0 text-[#171717] shadow-[0_32px_90px_rgba(12,17,21,0.28)] backdrop:bg-[rgba(12,17,21,0.42)]"
      >
        <form action={inviteMemberAction} className="grid gap-5 p-6">
          <div>
            <p className="text-lg font-semibold">Invite User</p>
            <p className="mt-1 text-sm leading-6 text-[#756756]">
              Add one or more email addresses and choose their SMM Agent role.
            </p>
          </div>
          <label className="space-y-2 text-sm font-medium">
            <span>Email addresses</span>
            <textarea
              name="emails"
              required
              rows={4}
              placeholder="user@example.com, admin@example.com"
              className="w-full resize-none rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Role</span>
            <select
              name="orgRole"
              defaultValue="member"
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="member">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f523f]"
            >
              Cancel
            </button>
            <button className="rounded-[12px] bg-[#171717] px-4 py-2.5 text-sm font-semibold text-white">
              Send Access
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
