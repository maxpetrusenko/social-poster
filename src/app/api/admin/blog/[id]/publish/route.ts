import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { publishBlogAutomationPost } from "@/lib/blog/automation";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const result = await publishBlogAutomationPost(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed" },
      { status: 400 }
    );
  }
}
