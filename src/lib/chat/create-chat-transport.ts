"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { createChatFetch } from "@/lib/chat/create-chat-fetch";

export type ChatTransportBody = {
  modelId: string;
  mode: "discuss" | "edit" | "build";
  scope?: string | null;
  editTarget?: string | null;
  projectId?: string;
  conversationId?: string;
  attachmentIds?: string[];
  operationId?: string;
  idempotencyKey?: string;
};

export function createDreamChatTransport({
  getBody,
  on402,
  onSuccess,
  onFetchStart,
  onFetchEnd,
  label,
}: {
  getBody: () => ChatTransportBody;
  on402?: () => void;
  onSuccess?: () => void;
  onFetchStart?: (url: string) => void;
  onFetchEnd?: (status: number) => void;
  label?: string;
}) {
  return new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    fetch: (reqInput, init) =>
      createChatFetch(reqInput, init, {
        label: label ?? "chat",
        on402,
        onSuccess,
        onFetchStart,
        onFetchEnd,
      }),
    prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => {
      const extra = getBody();
      return {
        body: {
          ...(body ?? {}),
          id,
          messages,
          trigger,
          messageId,
          modelId: extra.modelId,
          mode: extra.mode,
          scope: extra.scope ?? undefined,
          editTarget: extra.editTarget ?? undefined,
          projectId: extra.projectId,
          conversationId: extra.conversationId,
          attachmentIds: extra.attachmentIds,
          operationId: extra.operationId ?? extra.idempotencyKey,
          idempotencyKey: extra.idempotencyKey ?? extra.operationId,
        },
      };
    },
  });
}
