import { DashboardHero, DashboardPageContent } from "@/components/dashboard/ui";
import { WorkToPostReviewBoard } from "@/components/dashboard/work-to-post/work-to-post-review-board";

export default function WorkToPostReviewPage() {
  return <DashboardPageContent><DashboardHero eyebrow="Work to post · review" title="Publish intent stays visible, inspectable, and reversible." description="Fixture demo stays safe by default. Live workspace mode reads authenticated review records and keeps release actions proof-gated." /><WorkToPostReviewBoard /></DashboardPageContent>;
}
