import type { PersonDossierInput, PersonDossierResult, DossierStatus } from "./contracts";
import type { WorkToPostRepository } from "./repository";

const MAX_DOSSIER_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface DossierSourceResolver {
  verify(source: PersonDossierInput["sources"][number]): Promise<boolean>;
}

export const failClosedDossierSourceResolver: DossierSourceResolver = { async verify() { return false; } };

export function isPublicDossierUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && host !== "localhost" && host !== "0.0.0.0" && host !== "::1" && !host.endsWith(".local") && !host.endsWith(".internal") && !/^10\.|^127\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch { return false; }
}

export async function createPersonDossier(repository: WorkToPostRepository, workspaceId: string, input: PersonDossierInput, resolver: DossierSourceResolver = failClosedDossierSourceResolver): Promise<PersonDossierResult> {
  const sourceUrls = new Set(input.sources.map((source) => source.url));
  const claimsLinked = input.claims.every((claim) => claim.sourceUrls.length > 0 && claim.sourceUrls.every((url) => sourceUrls.has(url)));
  const validUrls = input.sources.every((source) => isPublicDossierUrl(source.url));
  const verified = await Promise.all(input.sources.map((source) => resolver.verify(source)));
  const fresh = input.sources.map((source) => Number.isFinite(Date.parse(source.capturedAt)) && Date.now() - Date.parse(source.capturedAt) <= MAX_DOSSIER_AGE_MS);
  const requiredPrimaryAndActivity = input.sources.filter((source) => source.kind === "primary_profile" || source.kind === "first_party_activity");
  const primaryAndActivityFresh = ["primary_profile", "first_party_activity"].every((kind) => requiredPrimaryAndActivity.some((source) => source.kind === kind && fresh[input.sources.indexOf(source)]));
  const professional = input.sources.filter((source, index) => source.kind === "professional_source" && fresh[index] && verified[index]);
  const hasPrimaryAndActivityShape = ["primary_profile", "first_party_activity"].every((kind) => input.sources.some((source) => source.kind === kind));
  const hasPrimaryAndActivity = primaryAndActivityFresh && requiredPrimaryAndActivity.every((source) => verified[input.sources.indexOf(source)]);
  const professionalSources = new Set(professional.map((source) => source.url)).size;
  const professionalShape = new Set(input.sources.filter((source) => source.kind === "professional_source").map((source) => source.url)).size >= 2;
  const status: DossierStatus = input.ambiguous ? "blocked_ambiguous" : !validUrls || !claimsLinked ? "blocked_insufficient_sources" : (hasPrimaryAndActivityShape || professionalShape) && !hasPrimaryAndActivity && professionalSources < 2 ? "blocked_stale" : !hasPrimaryAndActivity && professionalSources < 2 ? "blocked_insufficient_sources" : "clear";
  return repository.upsertDossier(workspaceId, input, status);
}
