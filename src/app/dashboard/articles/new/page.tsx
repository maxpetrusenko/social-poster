import { ArticleAgentChat } from "@/components/articles/article-agent-chat";
import { loadArticleAgentSettings } from "@/lib/article-agent/config";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const settings = await loadArticleAgentSettings();

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <ArticleAgentChat initialGenerationSettings={settings.generation} />
    </div>
  );
}
