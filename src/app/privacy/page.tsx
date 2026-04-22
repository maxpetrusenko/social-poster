import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getProductCanonicalUrl } from "@/lib/site-domains";

const effectiveDate = "April 21, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy — SMM Agent",
  description: "Privacy Policy for SMM Agent at clawposter.app.",
  alternates: {
    canonical: getProductCanonicalUrl("/privacy"),
  },
};

const sections = [
  {
    title: "Who we are",
    body: [
      "SMM Agent is a social posting and automation product operated by Max Petrusenko. You can contact us at max.petrusenko@gmail.com.",
      "This policy applies to clawposter.app, social.maxpetrusenko.com, and related SMM Agent services, dashboards, forms, integrations, and support channels.",
    ],
  },
  {
    title: "Information we collect",
    body: [
      "We collect account information such as your name, email address, login provider, workspace membership, and settings you choose to save.",
      "We collect workspace content such as drafts, scheduled posts, media URLs, publishing targets, comments, replies, direct messages where connected platform APIs allow access, generated outputs, support tickets, logs, and configuration needed to run the service.",
      "When you connect a social account, we may receive platform identifiers, profile details, handles, tokens, refresh tokens, scopes, pages, channels, post IDs, reply IDs, URLs, and publishing or inbox status. We use this data to authenticate, publish, read permitted inbox surfaces, refresh tokens, and show operational status.",
      "We collect technical information such as IP address, browser and device details, request metadata, cookies, session data, error logs, audit logs, pipeline runs, and security events.",
      "If you join a waitlist, request support, or email us, we collect the information you provide, including your email address and message content.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use information to provide and secure SMM Agent, create and manage accounts, connect social platforms, generate drafts, publish posts, process replies, schedule runs, troubleshoot errors, prevent abuse, send service messages, respond to support requests, and improve product reliability.",
      "We may use operational logs and traces to debug model calls, publishing failures, platform API errors, and support issues. We limit this use to operating and improving the service.",
      "We may send product, onboarding, or service emails. You can unsubscribe from marketing emails, but we may still send transactional messages about your account, security, billing, or service status.",
    ],
  },
  {
    title: "Email and contact data",
    body: [
      "We do not sell your email address or contact information.",
      "We do not rent email lists. We do not provide your email address to third parties for their own direct marketing.",
      "We may use trusted providers to deliver email, authenticate users, host infrastructure, process analytics, respond to support requests, or operate connected services. Those providers process information for us and are not allowed to use it for their own independent marketing.",
    ],
  },
  {
    title: "AI processing",
    body: [
      "SMM Agent uses AI providers and observability tools to generate social drafts, summarize source material, draft replies, answer dashboard questions, and debug model behavior.",
      "Inputs sent to AI systems may include the prompt, selected workspace context, content you provide, post text, reply candidates, article text, and related operational metadata. We design prompts to avoid sending secrets, raw credentials, access tokens, cookies, or unnecessary personal information.",
      "AI output can be wrong, incomplete, delayed, offensive, or unsuitable for a platform. You are responsible for reviewing content before publishing where the product gives you review controls.",
    ],
  },
  {
    title: "Sharing and disclosure",
    body: [
      "We share information with service providers that help us host, secure, authenticate, email, observe, analyze, support, and operate SMM Agent.",
      "We share information with social platforms when you connect accounts or ask SMM Agent to publish, read permitted inbox content, post replies, refresh account data, or perform another platform action.",
      "We may disclose information if required by law, legal process, security investigation, fraud prevention, protection of rights, business transfer, or enforcement of our terms.",
      "We do not sell personal information. We do not knowingly share personal information for cross-context behavioral advertising. If that changes, we will update this policy and provide required opt-out controls.",
    ],
  },
  {
    title: "Cookies and analytics",
    body: [
      "We use cookies and similar technologies for authentication, session management, security, preferences, and product functionality.",
      "We may use analytics and logging tools to understand usage, diagnose problems, and improve reliability. You can control some cookies through your browser settings, but blocking cookies may break login or dashboard features.",
    ],
  },
  {
    title: "Retention",
    body: [
      "We keep information for as long as needed to provide the service, comply with legal obligations, resolve disputes, enforce agreements, maintain security, and preserve operational history.",
      "You may request deletion of your account or workspace data. Some records may remain in backups, logs, legal records, security records, or platform records that we do not control.",
    ],
  },
  {
    title: "Your choices and rights",
    body: [
      "You can request access, correction, deletion, or export of personal information by contacting max.petrusenko@gmail.com.",
      "Depending on where you live, you may have rights to know what personal information we collect, request deletion or correction, limit certain uses of sensitive information, opt out of sale or sharing, and appeal a decision. We will not discriminate against you for exercising privacy rights.",
      "Because we do not sell personal information or knowingly share it for cross-context behavioral advertising, we do not currently provide a separate Do Not Sell or Share link.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use reasonable administrative, technical, and organizational safeguards designed to protect information. No service can guarantee perfect security.",
      "You are responsible for keeping your account credentials, connected platform access, and workspace permissions secure.",
    ],
  },
  {
    title: "Children",
    body: [
      "SMM Agent is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "International use",
    body: [
      "SMM Agent is operated from the United States. If you use the service from another country, you understand that information may be processed in the United States and other locations where our providers operate.",
    ],
  },
  {
    title: "Changes",
    body: [
      "We may update this policy from time to time. The effective date shows when the latest version took effect. Material changes may be announced in the product or by email when appropriate.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate={effectiveDate}
      intro="This Privacy Policy explains what SMM Agent collects, how we use it, when we share it, and what choices you have. It is written for a small software product that connects to social platforms, generates content, and publishes on your behalf."
      sections={sections}
    />
  );
}
