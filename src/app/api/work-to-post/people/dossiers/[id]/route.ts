import { NextResponse } from "next/server";
import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { getPersonDossier } from "@/lib/work-to-post/sqlite-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const { id } = await params;
  const dossier = await getPersonDossier(tenant.currentWorkspace.id, id);
  return dossier ? NextResponse.json({ dossier }) : NextResponse.json({ error: "Dossier not found." }, { status: 404 });
}
