import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Chat",
};

function ChatFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Canonical AI chat route — same surface as /chat for bookmarks and nav. */
export default function AiChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatView />
    </Suspense>
  );
}
