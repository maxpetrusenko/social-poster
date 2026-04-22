import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-auth";
import { generateBlogAutomationPost } from "@/lib/blog/automation";

const bodySchema = z.object({
  topic: z.string().trim().min(4).max(240),
  targetWords: z.number().int().min(1200).max(4000).optional(),
  sourceUrls: z.array(z.string().url()).max(12).optional(),
});

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const result = await generateBlogAutomationPost({
      ...parsed.data,
      createdByEmail: admin.email,
      trigger: "manual",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blog generation failed" },
      { status: 500 }
    );
  }
}
