import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createSupportTicket,
  normalizeSupportTicketSource,
  uploadLinearFileAsset,
  type SupportTicketSource,
} from "@/lib/support/tickets";
import { requireTenantContext } from "@/lib/tenancy";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type ParsedTicketRequest = {
  source: SupportTicketSource;
  topic: string;
  explanation: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  pageTitle?: string | null;
  autoRepair?: boolean;
  imageFile?: File | null;
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  const botAuthenticated = hasBotToken(request);
  if (!session && !botAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tenant: Awaited<ReturnType<typeof requireTenantContext>> | null = null;
  if (session) {
    try {
      tenant = await requireTenantContext();
    } catch {
      return NextResponse.json({ error: "Workspace context is required." }, { status: 401 });
    }
  }

  try {
    const parsed = await parseTicketRequest(request);
    if (!parsed.topic || !parsed.explanation) {
      return NextResponse.json(
        { error: "Topic and explanation are required." },
        { status: 400 }
      );
    }

    let imageUrl = parsed.imageUrl ?? null;
    if (parsed.imageFile) {
      const upload = await uploadSupportImage(parsed.imageFile);
      if (upload instanceof NextResponse) return upload;
      imageUrl = upload;
    }

    const ticket = await createSupportTicket({
      source: parsed.source,
      topic: parsed.topic,
      explanation: parsed.explanation,
      imageUrl,
      imageName: parsed.imageFile?.name ?? null,
      sourceUrl: parsed.sourceUrl,
      pageTitle: parsed.pageTitle,
      autoRepair: parsed.autoRepair,
      reporter: tenant
        ? {
            email: tenant.user.email,
            name: tenant.user.fullName,
            userId: tenant.user.id,
          }
        : {
            email: "bot",
            name: "Support bot",
          },
      workspace: tenant
        ? {
            id: tenant.currentWorkspace.id,
            name: tenant.currentWorkspace.name,
            organizationName: tenant.organization.name,
          }
        : null,
    });

    return NextResponse.json({ ...ticket, imageUrl });
  } catch (error) {
    if (error instanceof Error && /formdata|multipart/i.test(error.message)) {
      return NextResponse.json(
        { error: "Image upload could not be read. Try attaching the image again." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Support ticket could not be created.",
      },
      { status: 500 }
    );
  }
}

async function parseTicketRequest(request: NextRequest): Promise<ParsedTicketRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      source: normalizeSupportTicketSource(form.get("source")),
      topic: readFormString(form, "topic"),
      explanation: readFormString(form, "explanation"),
      imageUrl: readFormString(form, "imageUrl") || null,
      sourceUrl: readFormString(form, "sourceUrl") || readFormString(form, "pageUrl") || null,
      pageTitle: readFormString(form, "pageTitle") || null,
      autoRepair: readBoolean(form.get("autoRepair")),
      imageFile: readFormFile(form, "image"),
    };
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    source: normalizeSupportTicketSource(body.source),
    topic: readString(body.topic),
    explanation: readString(body.explanation),
    imageUrl: readString(body.imageUrl) || null,
    sourceUrl: readString(body.sourceUrl) || readString(body.pageUrl) || null,
    pageTitle: readString(body.pageTitle) || null,
    autoRepair: readBoolean(body.autoRepair),
    imageFile: null,
  };
}

async function uploadSupportImage(file: File): Promise<string | NextResponse> {
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Image attachment must be an image." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image attachment must be under 8 MB." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await uploadLinearFileAsset({
    bytes,
    contentType: file.type,
    filename: file.name,
  });

  if (!stored) {
    return NextResponse.json(
      { error: "Linear file upload is not configured. Add LINEAR_API_KEY or send an image URL." },
      { status: 503 }
    );
  }

  return stored.url;
}

function hasBotToken(request: NextRequest) {
  const expected = process.env.SUPPORT_BOT_TOKEN?.trim();
  if (!expected) return false;

  const headerToken = request.headers.get("x-support-bot-token")?.trim();
  const authToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  return headerToken === expected || authToken === expected;
}

function readFormString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readFormFile(form: FormData, key: string) {
  const value = form.get(key);
  if (!value || typeof value === "string") return null;
  return value.size > 0 ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
