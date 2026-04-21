import type { ReactNode } from "react";
import { SocialInboxTabs } from "@/components/dashboard/social-inbox-tabs";

export default function SocialInboxLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SocialInboxTabs />
      {children}
    </>
  );
}
