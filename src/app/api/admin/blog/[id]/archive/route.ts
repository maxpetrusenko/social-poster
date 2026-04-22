import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { archiveBlogAutomationPost } from "@/lib/blog/automation";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await archiveBlogAutomationPost(id);
  return NextResponse.json({ ok: true });
}
