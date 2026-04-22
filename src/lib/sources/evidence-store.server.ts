import "server-only";

import { db } from "@/db";

import {
  createSourceEvidenceStore,
  type SourceEvidenceStore,
} from "./evidence-store.repository";

export const sourceEvidenceStore: SourceEvidenceStore = createSourceEvidenceStore(db);
export { createSourceEvidenceStore };
export type {
  SourceEvidenceListInput,
  SourceEvidenceStatusUpdateInput,
  SourceEvidenceStore,
  SourceEvidenceUpsertInput,
} from "./evidence-store.repository";
