"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ScheduleEnabledToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  async function handleChange(nextChecked: boolean) {
    setChecked(nextChecked);

    const response = await fetch(`/api/schedules/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextChecked }),
    });

    if (!response.ok) {
      setChecked(!nextChecked);
      alert("Failed to update schedule");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => handleChange(event.target.checked)}
        className="w-4 h-4 rounded border-gray-300"
      />
      <span className="text-xs text-gray-500">
        {checked ? "Enabled" : "Disabled"}
      </span>
    </label>
  );
}
