import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createSupportTicket,
  normalizeSupportTicketSource,
  uploadLinearFileAsset,
  type SupportTicketSource,
} from "@/lib/support/tickets";
import { supportTicketRateLimiter } from "@/lib/support/rate-limit";
import { requireTenantContext } from "@/lib/tenancy";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOPIC_LENGTH = 120;
const MAX_EXPLANATION_LENGTH = 5000;

const SUPPORT_CATEGORIES = {
  bug: "Bug",
  account_access: "Account access",
  billing: "Billing",
  feature_request: "Feature request",
} as const;

type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

type ParsedTicketRequest = {
  source: SupportTicketSource;
  category?: string | null;
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
    if (parsed.topic.length > MAX_TOPIC_LENGTH) {
      return NextResponse.json(
        { error: `Topic must be ${MAX_TOPIC_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
    if (parsed.explanation.length > MAX_EXPLANATION_LENGTH) {
      return NextResponse.json(
        { error: `Explanation must be ${MAX_EXPLANATION_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
    let category: SupportCategory | null = null;
    if (parsed.category) {
      if (!isSupportCategory(parsed.category)) {
        return NextResponse.json(
          { error: "Choose a valid support category." },
          { status: 400 }
        );
      }
      category = parsed.category;
    }

    if (session && tenant) {
      const rateLimit = supportTicketRateLimiter.check(tenant.user.id);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: "Too many support requests. Try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
          }
        );
      }
    }

    let imageUrl = parsed.imageUrl ?? null;
    if (parsed.imageFile) {
      const upload = await uploadSupportImage(parsed.imageFile);
      if (upload instanceof NextResponse) return upload;
      imageUrl = upload;
    }

    const ticket = await createSupportTicket({
      source: session ? "from_user_triage" : parsed.source,
      topic: category
        ? `[${SUPPORT_CATEGORIES[category]}] ${parsed.topic}`
        : parsed.topic,
      explanation: parsed.explanation,
      imageUrl,
      imageName: parsed.imageFile?.name ?? null,
      sourceUrl: parsed.sourceUrl,
      pageTitle: parsed.pageTitle,
      autoRepair: session ? false : parsed.autoRepair,
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

    if (!session) {
      return NextResponse.json({ ...ticket, imageUrl });
    }

    return NextResponse.json({
      issue: { identifier: ticket.issue.identifier },
      attachment: { status: ticket.attachment.status },
    });
  } catch (error) {
    if (error instanceof Error && /formdata|multipart/i.test(error.message)) {
      return NextResponse.json(
        { error: "Image upload could not be read. Try attaching the image again." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Support is temporarily unavailable. Try again in a moment." },
      { status: 502 }
    );
  }
}

async function parseTicketRequest(request: NextRequest): Promise<ParsedTicketRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      source: normalizeSupportTicketSource(form.get("source")),
      category: readFormString(form, "category") || null,
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
    category: readString(body.category) || null,
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
      { error: "Image upload is temporarily unavailable. Try again without the image." },
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

function isSupportCategory(value: string): value is SupportCategory {
  return Object.prototype.hasOwnProperty.call(SUPPORT_CATEGORIES, value);
}
