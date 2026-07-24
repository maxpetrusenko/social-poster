import { DashboardHero, DashboardPageContent } from "@/components/dashboard/ui";
import { WorkToPostAnalytics } from "@/components/dashboard/work-to-post/work-to-post-analytics";

export default function WorkToPostAnalyticsPage() {
  return <DashboardPageContent><DashboardHero eyebrow="Work to post · analytics" title="Learning signals need their limits in the frame." description="Fixture demo is safe by default. Live workspace mode reads candidate, timeline, and learning records while keeping outcome correlation explicitly non-causal." /><WorkToPostAnalytics /></DashboardPageContent>;
}
