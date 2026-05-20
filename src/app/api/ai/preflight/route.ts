import { NextResponse } from "next/server";
import { runAiPreflightServer } from "@/lib/ai/preflight-server";

/**
 * POST /api/ai/preflight — authenticate, bootstrap profile, check tokens,
 * create/reuse project (build/edit) and conversation before /api/chat.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[api/ai/preflight] POST");
  }

  const result = await runAiPreflightServer(request);

  if (!result.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[api/ai/preflight] blocked", result.code, result.status);
    }
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        code: result.code,
        hint: result.hint,
      },
      { status: result.status },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/ai/preflight] ok", {
      userId: result.userId,
      projectId: result.projectId,
      conversationId: result.conversationId,
    });
  }

  return NextResponse.json({
    ok: true,
    userId: result.userId,
    projectId: result.projectId,
    conversationId: result.conversationId,
    tokensRemaining: result.tokensRemaining,
  });
}
