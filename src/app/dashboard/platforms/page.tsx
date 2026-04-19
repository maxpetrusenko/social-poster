import { redirect } from "next/navigation";
import { PLATFORM_TYPES } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextParams = new URLSearchParams();
  if (params.connect) {
    nextParams.set("connect", "1");
    if (PLATFORM_TYPES.includes(params.connect as (typeof PLATFORM_TYPES)[number])) {
      nextParams.set("platform", params.connect);
    }
  }
  if (
    PLATFORM_TYPES.includes((params.platform as (typeof PLATFORM_TYPES)[number]) ?? "twitter") &&
    params.platform
  ) {
    nextParams.set("platform", params.platform);
  }

  redirect(
    `/dashboard/workspace-settings/social-accounts${
      nextParams.toString() ? `?${nextParams.toString()}` : ""
    }`
  );
}
