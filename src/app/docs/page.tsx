import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LockKeyhole,
  Send,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Use SMM Agent from external agents and scripts to create, schedule, and publish social posts.",
  alternates: {
    canonical: "https://smmagent.app/docs",
  },
};

const baseUrl = "https://smmagent.app";

const createDraft = `curl -X POST ${baseUrl}/api/posts \\
  -H "Authorization: Bearer sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Launch note",
    "content": "Ship note: we added public agent posting docs.",
    "contentType": "text",
    "intent": "draft"
  }'`;

const schedulePost = `curl -X POST ${baseUrl}/api/posts \\
  -H "Authorization: Bearer sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Tomorrow's product note, queued from an agent.",
    "contentType": "text",
    "intent": "schedule",
    "scheduledAt": "2026-05-21T14:00:00.000Z",
    "platformIds": ["platform_id_from_dashboard"]
  }'`;

const publishPost = `curl -X POST ${baseUrl}/api/posts/POST_ID/publish \\
  -H "Authorization: Bearer sk_YOUR_KEY"`;

const agentPrompt = `You can post through SMM Agent.

Base URL: ${baseUrl}
Auth: Authorization: Bearer $SMM_AGENT_API_KEY

Default behavior:
1. Create drafts with POST /api/posts unless the user explicitly asks to schedule or publish.
2. Use intent "schedule" only with a future ISO scheduledAt.
3. Use POST /api/posts/{id}/publish only after explicit publish approval.
4. Never print the API key.`;

const fields = [
  ["content", "Required unless media is supplied. Main post copy."],
  ["title", "Optional internal title for the dashboard."],
  ["contentType", "Use text for normal posts. Media routes may set image or video."],
  ["intent", "draft by default. schedule queues a future post."],
  ["scheduledAt", "Required for schedule. Use an ISO timestamp in the future."],
  ["platformIds", "Optional channel target IDs from your workspace."],
  ["mediaUrl or mediaUrls", "Optional public media URL or array of URLs."],
  ["platformOverrides", "Optional per-platform caption, format, first comment, and related fields."],
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[#d9cbb8] bg-[#121817] p-4 text-sm leading-6 text-[#f3eadc] shadow-sm">
      <code>{children}</code>
    </pre>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: typeof TerminalSquare;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-1 rounded-md border border-[#d9cbb8] bg-white p-2 text-[#0e615d]">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <p className="section-eyebrow text-[#0e615d]">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#0c1115]">{title}</h2>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen">
      <section className="border-b border-[#e1d4c2] bg-[#f7f1e6]">
        <div className="container py-6">
          <nav className="flex items-center justify-between gap-4 text-sm">
            <Link href="/" className="font-semibold text-[#0c1115]">
              SMM Agent
            </Link>
            <div className="flex items-center gap-4 text-[#4b535c]">
              <Link href="/dashboard/settings/api-keys" className="hover:text-[#0c1115]">
                API keys
              </Link>
              <a
                href="https://github.com/maxpetrusenko/social-poster"
                className="hover:text-[#0c1115]"
              >
                GitHub
              </a>
            </div>
          </nav>
        </div>
      </section>

      <section className="bg-[#f7f1e6]">
        <div className="container grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="section-eyebrow text-[#0e615d]">Agent posting docs</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.96] text-[#0c1115] md:text-7xl">
              Post from any agent.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#34404a]">
              Use the SMM Agent API to create drafts, schedule posts, and publish
              approved content from Codex, Claude, Cursor, cron jobs, or any HTTP client.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard/settings/api-keys"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0c1115] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1c242c]"
              >
                <KeyRound size={16} aria-hidden="true" />
                Create API key
              </Link>
              <a
                href="#quickstart"
                className="inline-flex items-center gap-2 rounded-lg border border-[#cdbda8] bg-white px-4 py-2.5 text-sm font-semibold text-[#0c1115] transition hover:border-[#0e615d]"
              >
                Quickstart
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-[#d9cbb8] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-[#0e615d]" size={22} aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-[#0c1115]">Safe default</h2>
                <p className="text-sm text-[#4b535c]">
                  Agents should create drafts first. Publishing is a separate explicit call.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-[#34404a]">
              {[
                "Bearer keys are workspace scoped.",
                "Read & Write permission is required for posting.",
                "Schedule times must be in the future.",
                "Connected platform targets stay inside the current workspace.",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0e615d]" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="quickstart" className="bg-white">
        <div className="container py-14">
          <SectionTitle icon={ClipboardList} eyebrow="Quickstart" title="Create a draft" />
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <ol className="space-y-4 text-[#34404a]">
              <li className="rounded-lg border border-[#eadfce] bg-[#fbf7ef] p-4">
                <strong className="block text-[#0c1115]">1. Create a key</strong>
                Open dashboard settings, create an App Access key, and choose Read & Write.
              </li>
              <li className="rounded-lg border border-[#eadfce] bg-[#fbf7ef] p-4">
                <strong className="block text-[#0c1115]">2. Store it as a secret</strong>
                Use <code className="font-mono">SMM_AGENT_API_KEY</code> in your agent runtime.
              </li>
              <li className="rounded-lg border border-[#eadfce] bg-[#fbf7ef] p-4">
                <strong className="block text-[#0c1115]">3. Call the API</strong>
                Start with drafts. Add schedule or publish only when requested.
              </li>
            </ol>
            <CodeBlock>{createDraft}</CodeBlock>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e1d4c2] bg-[#f7f1e6]">
        <div className="container grid gap-10 py-14 lg:grid-cols-2">
          <div>
            <SectionTitle icon={TerminalSquare} eyebrow="Scheduling" title="Queue a future post" />
            <p className="mb-5 text-[#34404a]">
              Use <code className="font-mono">intent: &quot;schedule&quot;</code> with a future
              ISO timestamp. Include <code className="font-mono">platformIds</code> when
              you want exact channel targeting.
            </p>
            <CodeBlock>{schedulePost}</CodeBlock>
          </div>
          <div>
            <SectionTitle icon={Send} eyebrow="Publishing" title="Publish an approved post" />
            <p className="mb-5 text-[#34404a]">
              Publishing runs the connected platform pipeline for the saved post targets.
              Keep this call behind explicit user approval.
            </p>
            <CodeBlock>{publishPost}</CodeBlock>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="container grid gap-10 py-14 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <SectionTitle icon={LockKeyhole} eyebrow="Payload" title="Fields agents should know" />
            <div className="overflow-hidden rounded-lg border border-[#e1d4c2]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {fields.map(([field, note]) => (
                    <tr key={field} className="border-b border-[#e1d4c2] last:border-0">
                      <th className="w-44 bg-[#fbf7ef] px-4 py-3 font-mono text-xs text-[#0c1115]">
                        {field}
                      </th>
                      <td className="px-4 py-3 text-[#34404a]">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <SectionTitle icon={TerminalSquare} eyebrow="Agent prompt" title="Drop-in instructions" />
            <CodeBlock>{agentPrompt}</CodeBlock>
          </div>
        </div>
      </section>
    </main>
  );
}
