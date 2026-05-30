import { create } from "zustand";
import type { Message } from "@/lib/supabase/types";

/** Stable empty array for Zustand selectors — never use `?? []` inline. */
export const EMPTY_CHAT_MESSAGES: Message[] = [];

type ChatConversationState = {
  messagesByConversationId: Record<string, Message[]>;
  loadingByConversationId: Record<string, boolean>;
  errorByConversationId: Record<string, string | null>;
  setCachedMessages: (conversationId: string, messages: Message[]) => void;
  getCachedMessages: (conversationId: string) => Message[] | undefined;
  hasCachedMessages: (conversationId: string) => boolean;
  setLoading: (conversationId: string, loading: boolean) => void;
  setError: (conversationId: string, error: string | null) => void;
  patchCachedMessage: (conversationId: string, message: Message) => void;
};

export const useChatConversationStore = create<ChatConversationState>((set, get) => ({
  messagesByConversationId: {},
  loadingByConversationId: {},
  errorByConversationId: {},

  setCachedMessages: (conversationId, messages) =>
    set((s) => ({
      messagesByConversationId: { ...s.messagesByConversationId, [conversationId]: messages },
    })),

  getCachedMessages: (conversationId) => get().messagesByConversationId[conversationId],

  hasCachedMessages: (conversationId) =>
    Object.prototype.hasOwnProperty.call(get().messagesByConversationId, conversationId),

  setLoading: (conversationId, loading) =>
    set((s) => ({
      loadingByConversationId: { ...s.loadingByConversationId, [conversationId]: loading },
    })),

  setError: (conversationId, error) =>
    set((s) => ({
      errorByConversationId: { ...s.errorByConversationId, [conversationId]: error },
    })),

  patchCachedMessage: (conversationId, message) =>
    set((s) => {
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const idx = prev.findIndex((m) => m.id === message.id);
      const next =
        idx >= 0 ? prev.map((m, i) => (i === idx ? message : m)) : [...prev, message];
      return {
        messagesByConversationId: { ...s.messagesByConversationId, [conversationId]: next },
      };
    }),
}));

const loadAbortByConversation = new Map<string, AbortController>();

/** Abort any in-flight message fetch for a conversation and register a new controller. */
export function beginConversationLoad(conversationId: string): AbortController {
  loadAbortByConversation.get(conversationId)?.abort();
  const ac = new AbortController();
  loadAbortByConversation.set(conversationId, ac);
  return ac;
}

export function endConversationLoad(conversationId: string, ac: AbortController) {
  if (loadAbortByConversation.get(conversationId) === ac) {
    loadAbortByConversation.delete(conversationId);
  }
}
