import type { OAuthReturnNotice } from "@/lib/providers/oauth-return";

export function OAuthReturnNoticeBanner({
  notice,
}: {
  notice: OAuthReturnNotice | null;
}) {
  if (!notice) return null;
  const isError = notice.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "rounded-[14px] border border-[#e5c7ba] bg-[#f8e8e1] px-4 py-3 text-sm font-semibold text-[#9a5947]"
          : "rounded-[14px] border border-[#c9d9c3] bg-[#e8f1e4] px-4 py-3 text-sm font-semibold text-[#3f6b3a]"
      }
    >
      {notice.message}
    </div>
  );
}
