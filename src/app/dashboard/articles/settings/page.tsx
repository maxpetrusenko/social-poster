import { CheckCircle2, FileText } from "lucide-react";
import { ArticleGenerationSettingsPanel } from "@/components/articles/article-generation-settings-panel";
import { loadArticleAgentSettings } from "@/lib/article-agent/config";

export const dynamic = "force-dynamic";

export default async function ArticleSettingsPage() {
  const settings = await loadArticleAgentSettings();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <div>
        <p className="section-eyebrow text-[#806f58]">Article Generation</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-[#171717]">
          Article Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#806f58]">
          File-backed prompt and skills for article generation. Runtime keys stay in env and model provider settings.
        </p>
      </div>

      <div className="mt-8">
        <main className="space-y-6">
          <ArticleGenerationSettingsPanel initialGenerationSettings={settings.generation} />

          <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#0f7ea9]" />
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
                  prompt.md
                </h2>
                <p className="mt-1 font-mono text-xs text-[#806f58]">{settings.promptPath}</p>
              </div>
            </div>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-[16px] bg-[#fffaf2] p-4 text-xs leading-6 text-[#3d3328]">
              {settings.prompt}
            </pre>
          </section>

          <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#0f7ea9]" />
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
                  Skills
                </h2>
                <p className="mt-1 font-mono text-xs text-[#806f58]">{settings.skillsPath}</p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {settings.skills.length ? (
                settings.skills.map((skill) => (
                  <details
                    key={skill.name}
                    className="rounded-[16px] border border-[#eadfce] bg-[#fffaf2] p-4"
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-[#171717]">
                      {skill.name}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#3d3328]">
                      {skill.content}
                    </pre>
                  </details>
                ))
              ) : (
                <p className="text-sm text-[#806f58]">No skill files found.</p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
