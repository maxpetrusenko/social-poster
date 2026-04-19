import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { SocialMediaBotPage } from "@/components/landing/social-media-bot-page";
import { getSession } from "@/lib/auth";
import { getProductCanonicalUrl } from "@/lib/site-domains";

export const metadata: Metadata = {
  title: "AI Social Media Bot — ClawPoster",
  description: "Find the ClawPoster social media agent for teams searching for an AI social media bot, social media agent, or automated posting workflow.",
  alternates: {
    canonical: getProductCanonicalUrl("/social-media-bot"),
  },
};

export default async function Page() {
  const session = await getSession();

  return (
    <>
      <LandingNav isLoggedIn={!!session} />
      <SocialMediaBotPage />
      <LandingFooter />
    </>
  );
}
