import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getProductCanonicalUrl } from "@/lib/site-domains";

const effectiveDate = "April 21, 2026";

export const metadata: Metadata = {
  title: "Terms of Service — SMM Agent",
  description: "Terms of Service for SMM Agent at clawposter.app.",
  alternates: {
    canonical: getProductCanonicalUrl("/terms"),
  },
};

const sections = [
  {
    title: "Agreement",
    body: [
      "These Terms of Service govern your access to and use of SMM Agent, including clawposter.app, social.maxpetrusenko.com, dashboards, APIs, automations, integrations, and related services.",
      "By using SMM Agent, you agree to these terms. If you use SMM Agent for a company, client, or workspace, you confirm that you have authority to bind that organization.",
    ],
  },
  {
    title: "The service",
    body: [
      "SMM Agent helps users draft, adapt, schedule, publish, and monitor social content across connected platforms.",
      "Features may include AI-generated drafts, platform-specific formatting, scheduled publishing, connected account management, inbox surfaces, replies, analytics, support intake, logs, and automation workflows.",
      "We may change, suspend, limit, or discontinue features at any time, including when platform APIs, rate limits, account permissions, or provider policies change.",
    ],
  },
  {
    title: "Accounts and access",
    body: [
      "You must provide accurate account information and keep credentials secure. You are responsible for activity under your account, workspace, API keys, connected social accounts, and invited team members.",
      "You may only connect accounts, pages, profiles, or workspaces that you own or are authorized to manage.",
      "We may suspend or restrict access if we believe your use creates security risk, legal risk, platform policy risk, abuse risk, billing risk, or harm to SMM Agent, users, social platforms, or third parties.",
    ],
  },
  {
    title: "User content",
    body: [
      "You keep ownership of content you submit, upload, generate, schedule, publish, or connect to SMM Agent.",
      "You grant SMM Agent a license to host, store, copy, process, display, transmit, transform, and publish your content as needed to provide the service, operate integrations, create previews, troubleshoot issues, and improve reliability.",
      "You are responsible for your content, instructions, account settings, platform targets, claims, disclosures, permissions, media rights, and publication choices.",
    ],
  },
  {
    title: "AI output",
    body: [
      "AI-generated content may be inaccurate, incomplete, duplicative, delayed, offensive, infringing, noncompliant, or unsuitable for your brand or platform. You are responsible for reviewing and approving output before use where review controls are available.",
      "SMM Agent does not guarantee that AI output is original, lawful, platform-safe, factual, or fit for a particular campaign.",
      "You should not rely on SMM Agent for legal, financial, medical, safety, crisis, political, employment, or regulated-industry advice.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You may not use SMM Agent to violate law, infringe rights, mislead people, impersonate others, scrape or spam unlawfully, distribute malware, bypass platform rules, harvest credentials, publish prohibited content, or interfere with the service.",
      "You may not use SMM Agent to send unlawful commercial messages or ignore unsubscribe, consent, attribution, disclosure, advertising, or platform requirements that apply to your campaigns.",
      "You may not reverse engineer, overload, resell, sublicense, or use SMM Agent to build a competing service unless we authorize it in writing.",
    ],
  },
  {
    title: "Social platforms",
    body: [
      "Your use of connected social platforms remains subject to each platform's terms, developer policies, content rules, rate limits, and API restrictions.",
      "Platform APIs can fail, revoke access, change scopes, reject posts, throttle requests, remove content, or return incomplete data. SMM Agent is not responsible for platform decisions or third-party outages.",
      "If a platform requires extra review, permissions, business verification, or user action, features may not work until those requirements are satisfied.",
    ],
  },
  {
    title: "Email and communications",
    body: [
      "You agree that SMM Agent may send transactional messages about login, security, account activity, support, billing, platform connection status, product changes, and service operations.",
      "If we send marketing emails, we will provide a way to opt out. You are responsible for complying with email marketing laws for campaigns you create or send outside SMM Agent.",
      "We do not sell your email address.",
    ],
  },
  {
    title: "Fees and trials",
    body: [
      "Some features may require payment, usage limits, credits, subscriptions, or a separate order. Fees are nonrefundable unless we state otherwise in writing or applicable law requires a refund.",
      "We may change pricing, limits, trials, or plan features with notice when required. If you do not want the new terms, your remedy is to stop using the paid service before the change applies.",
    ],
  },
  {
    title: "Beta features",
    body: [
      "Some features may be experimental, beta, preview, or provided for evaluation. Beta features may be unstable, inaccurate, incomplete, or removed without notice.",
      "You use beta features at your own risk and should not rely on them for critical workflows without independent review.",
    ],
  },
  {
    title: "Privacy",
    body: [
      "Our Privacy Policy explains how we collect and use personal information. By using SMM Agent, you also agree to the Privacy Policy.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "SMM Agent integrates with third-party providers for hosting, authentication, email, AI, observability, social platforms, storage, analytics, and support.",
      "We are not responsible for third-party services, content, policies, outages, data practices, or platform enforcement decisions.",
    ],
  },
  {
    title: "No warranties",
    body: [
      "SMM Agent is provided as is and as available. To the maximum extent permitted by law, we disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, title, noninfringement, accuracy, availability, and uninterrupted operation.",
      "We do not warrant that posts will publish successfully, schedules will run at an exact time, integrations will remain available, or generated content will meet your expectations.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, SMM Agent and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost revenue, lost data, reputational harm, business interruption, platform suspension, or failed campaigns.",
      "To the maximum extent permitted by law, our total liability for any claim related to SMM Agent is limited to the amount you paid to SMM Agent for the service in the three months before the event giving rise to the claim, or 100 dollars if you paid nothing.",
    ],
  },
  {
    title: "Indemnity",
    body: [
      "You will defend, indemnify, and hold harmless SMM Agent and its operator from claims, damages, liabilities, costs, and expenses arising from your content, connected accounts, campaigns, instructions, breach of these terms, violation of law, violation of platform rules, or infringement of third-party rights.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may stop using SMM Agent at any time. We may suspend or terminate access at any time if we believe continued use creates risk or violates these terms.",
      "After termination, provisions that by their nature should survive will survive, including ownership, payment obligations, disclaimers, limits of liability, indemnity, and dispute terms.",
    ],
  },
  {
    title: "Governing law",
    body: [
      "These terms are governed by the laws of the State of New York, without regard to conflict of law rules, unless applicable law requires otherwise.",
      "Before filing a claim, you agree to contact max.petrusenko@gmail.com and try to resolve the dispute informally.",
    ],
  },
  {
    title: "Changes",
    body: [
      "We may update these terms from time to time. The effective date shows when the latest version took effect. Your continued use of SMM Agent after changes become effective means you accept the updated terms.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about these terms can be sent to max.petrusenko@gmail.com.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate={effectiveDate}
      intro="These terms define how SMM Agent can be used, what you are responsible for, and the limits that protect the product and its operator."
      sections={sections}
    />
  );
}
