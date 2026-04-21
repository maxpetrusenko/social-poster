import { NextResponse } from "next/server";
import { requireApiWorkspacePublisher } from "@/lib/api-authorization";
import { sendInboxReply } from "@/lib/inbox/data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = await requireApiWorkspacePublisher();
  if (context instanceof NextResponse) return context;

  try {
    const body = (await request.json()) as {
      conversationId?: string;
      messageId?: string;
      text?: string;
    };
    if (!body.conversationId || !body.messageId) {
      return NextResponse.json(
        { error: "Conversation and message are required." },
        { status: 400 }
      );
    }

    await sendInboxReply({
      workspaceId: context.currentWorkspace.id,
      conversationId: body.conversationId,
      messageId: body.messageId,
      text: body.text ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reply." },
      { status: 500 }
    );
  }
}
