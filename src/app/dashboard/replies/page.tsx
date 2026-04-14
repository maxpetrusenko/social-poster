import { RepliesMockShowcase } from "@/components/dashboard/replies-mock-showcase";
import { getRepliesPageData } from "@/lib/dashboard/replies-data";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const data = await getRepliesPageData();

  return (
    <div className="space-y-6">
      <RepliesMockShowcase connections={data.connections} initialCards={data.candidates} />
    </div>
  );
}
