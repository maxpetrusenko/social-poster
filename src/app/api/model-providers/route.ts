import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import {
  createModelProvider,
  isModelProviderId,
  listModelSettings,
} from "@/lib/model-providers";

export async function GET() {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const settings = await listModelSettings(tenant.currentWorkspace.id);
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const body = (await request.json()) as {
    provider?: unknown;
    label?: string;
    apiKey?: string;
    managementKey?: string;
    baseUrl?: string;
    protocol?: string;
    manualModelIds?: string[];
  };

  if (!isModelProviderId(body.provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }
  if (!body.apiKey?.trim()) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  try {
    const result = await createModelProvider({
      workspaceId: tenant.currentWorkspace.id,
      userId: tenant.user.id,
      provider: body.provider,
      label: body.label,
      apiKey: body.apiKey.trim(),
      managementKey: body.managementKey?.trim() || undefined,
      baseUrl: body.baseUrl,
      protocol: body.protocol,
      manualModelIds: body.manualModelIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider test failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
