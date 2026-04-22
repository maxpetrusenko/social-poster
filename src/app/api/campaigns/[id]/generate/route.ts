import { NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { createMockGeneration } from "@/lib/campaigns/records";
import { recordTenantAuditEvent } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const campaign = await createMockGeneration(tenant, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    await recordTenantAuditEvent(tenant, {
      action: "campaign.generate",
      targetType: "campaign",
      targetId: id,
      metadata: {
        creativeCount: campaign.creatives.length,
        endpoint: "POST /api/campaigns/[id]/generate",
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/generate error:", error);
    return NextResponse.json({ error: "Failed to generate campaign creative" }, { status: 500 });
  }
}
