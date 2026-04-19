/**
 * Shared media upload utilities extracted from existing provider patterns
 * (LinkedIn binary upload, URL-based media fetching, etc.).
 */

import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Read bytes from a local file path or remote URL
// ---------------------------------------------------------------------------

export async function readBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Media download failed ${response.status}: ${source}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

// ---------------------------------------------------------------------------
// Convert Uint8Array to ArrayBuffer (needed for some fetch body types)
// ---------------------------------------------------------------------------

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

// ---------------------------------------------------------------------------
// Upload binary data to a pre-signed URL (LinkedIn-style PUT upload)
// ---------------------------------------------------------------------------

export async function uploadBinary(
  uploadUrl: string,
  source: string,
  options: {
    accessToken?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const bytes = await readBytes(source);
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    ...(options.headers ?? {}),
  };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000
  );

  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: toArrayBuffer(bytes),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Binary upload failed (${response.status}): ${text.slice(0, 500)}`
      );
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Build a multipart/form-data body from parts
// ---------------------------------------------------------------------------

export interface MultipartPart {
  name: string;
  value: string | Blob;
  filename?: string;
  contentType?: string;
}

export function buildMultipartBody(parts: MultipartPart[]): FormData {
  const formData = new FormData();
  for (const part of parts) {
    if (typeof part.value === "string") {
      formData.append(part.name, part.value);
    } else {
      formData.append(part.name, part.value, part.filename);
    }
  }
  return formData;
}

// ---------------------------------------------------------------------------
// Resolve the first available media source from PublishContent
// ---------------------------------------------------------------------------

export function firstMediaSource(content: {
  mediaFiles?: string[];
  mediaUrls?: string[];
}): string | undefined {
  return content.mediaFiles?.[0] ?? content.mediaUrls?.[0];
}
