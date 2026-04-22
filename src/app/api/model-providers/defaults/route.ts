import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { saveModelDefaults } from "@/lib/model-providers";

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const body = (await request.json()) as {
    writingModelCatalogId?: string | null;
    replyModelCatalogId?: string | null;
    agentModelCatalogId?: string | null;
    fastModelCatalogId?: string | null;
    imageModelCatalogId?: string | null;
    embeddingModelCatalogId?: string | null;
  };

  try {
    await saveModelDefaults({
      workspaceId: tenant.currentWorkspace.id,
      writingModelCatalogId: body.writingModelCatalogId,
      replyModelCatalogId: body.replyModelCatalogId,
      agentModelCatalogId: body.agentModelCatalogId,
      fastModelCatalogId: body.fastModelCatalogId,
      imageModelCatalogId: body.imageModelCatalogId,
      embeddingModelCatalogId: body.embeddingModelCatalogId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Model defaults could not be saved",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
