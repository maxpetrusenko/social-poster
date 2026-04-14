import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PLATFORM_TYPES } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const nextParams = new URLSearchParams();
  if (params.connect) nextParams.set("connect", params.connect);
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
