import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import { applyCampaignToCalendar } from "@/lib/campaigns/records";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = await applyCampaignToCalendar(tenant, {
      campaignId: id,
      creativeId: typeof body.creativeId === "string" ? body.creativeId : null,
      platformIds: Array.isArray(body.platformIds)
        ? body.platformIds.filter((value: unknown): value is string => typeof value === "string")
        : [],
      content: typeof body.content === "string" ? body.content : "",
      intent: typeof body.intent === "string" ? body.intent : "draft",
      scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : null,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await recordTenantAuditEvent(tenant, {
      action: "campaign.apply_to_calendar",
      targetType: "campaign",
      targetId: id,
      metadata: {
        postId: result.postId,
        targetCount: result.targetCount,
        endpoint: "POST /api/campaigns/[id]/apply-to-calendar",
      },
    });

    return NextResponse.json({
      postId: result.postId,
      targetCount: result.targetCount,
      message: "Campaign draft created",
    }, { status: result.status });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/apply-to-calendar error:", error);
    return NextResponse.json({ error: "Failed to apply campaign to calendar" }, { status: 500 });
  }
}
