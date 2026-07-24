import { NextResponse } from "next/server";
import { createPersonDossier } from "@/lib/work-to-post/dossier";
import { createSqliteWorkToPostRepository } from "@/lib/work-to-post/sqlite-repository";
import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import type { PersonDossierInput } from "@/lib/work-to-post/contracts";
import { isPublicDossierUrl } from "@/lib/work-to-post/dossier";

export async function POST(request: Request) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const input = await parseDossier(request);
  if (!input) return NextResponse.json({ error: "Invalid public-professional dossier." }, { status: 400 });
  const dossier = await createPersonDossier(createSqliteWorkToPostRepository(), tenant.currentWorkspace.id, input);
  return NextResponse.json({ dossier }, { status: 201 });
}

async function parseDossier(request: Request): Promise<PersonDossierInput | null> {
  try {
    const value = await request.json() as Record<string, unknown>;
    if (!value || typeof value.canonicalIdentityKey !== "string" || typeof value.displayName !== "string" || !Array.isArray(value.sources) || !Array.isArray(value.claims)) return null;
    const sources = value.sources as Array<Record<string, unknown>>;
    const claims = value.claims as Array<Record<string, unknown>>;
    if (sources.some((source) => typeof source.url !== "string" || !isPublicUrl(source.url) || !["primary_profile", "first_party_activity", "professional_source"].includes(String(source.kind)) || typeof source.capturedAt !== "string") || claims.some((claim) => typeof claim.statement !== "string" || !Array.isArray(claim.sourceUrls) || claim.sourceUrls.some((url) => typeof url !== "string"))) return null;
    return { canonicalIdentityKey: value.canonicalIdentityKey.trim(), displayName: value.displayName.trim(), sources: sources.map((source) => ({ url: String(source.url), kind: source.kind as PersonDossierInput["sources"][number]["kind"], capturedAt: String(source.capturedAt) })), claims: claims.map((claim) => ({ statement: String(claim.statement), sourceUrls: claim.sourceUrls as string[] })), ...(value.ambiguous === true ? { ambiguous: true } : {}) };
  } catch { return null; }
}

const isPublicUrl = isPublicDossierUrl;
