/** Types and API client for XRaySense AI Health Assistant. */

import { getApiBaseUrl } from "@/lib/api";
import { apiFetch } from "@/lib/api-client";
import type { PredictionLabel, SeverityLabel } from "@/lib/types";

export type HealthChatCardType =
  | "prediction"
  | "confidence"
  | "severity"
  | "recommendation"
  | "doctor_notes"
  | "comparison"
  | "emergency"
  | "disclaimer";

export interface ComparisonScanSnapshot {
  scan_id: number;
  date: string;
  prediction: PredictionLabel | string;
  confidence_pct: number;
  severity: SeverityLabel | string;
  findings: string;
}

export interface HealthChatCard {
  type: HealthChatCardType;
  data: Record<string, unknown>;
}

export interface HealthChatResponse {
  conversationId: number;
  userMessageId: number;
  assistantMessageId: number;
  answer: string;
  isEmergency: boolean;
  cards: HealthChatCard[];
  disclaimer: string;
}

export interface ChatMessageRecord {
  id: number;
  conversationId: number;
  sender: "user" | "assistant";
  message: string;
  createdAt: string;
}

export interface ChatConversationSummary {
  id: number;
  userId: number;
  scanId: number | null;
  createdAt: string;
  messageCount: number;
  preview: string | null;
}

export interface ChatConversationDetail {
  id: number;
  userId: number;
  scanId: number | null;
  createdAt: string;
  messages: ChatMessageRecord[];
}

export interface KnowledgeTopic {
  id: string;
  topic: string;
  title: string;
  summary: string;
}

export interface KnowledgeArticle extends KnowledgeTopic {
  content: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // ignore
  }
  return `Request failed (${response.status}).`;
}

export async function postHealthChat(params: {
  message: string;
  scanId: number;
  conversationId?: number | null;
}): Promise<HealthChatResponse> {
  const response = await apiFetch(`${getApiBaseUrl()}/health-assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      scan_id: params.scanId,
      conversation_id: params.conversationId ?? undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    conversation_id: number;
    user_message_id: number;
    assistant_message_id: number;
    answer: string;
    is_emergency: boolean;
    cards: HealthChatCard[];
    disclaimer: string;
  };
  return {
    conversationId: data.conversation_id,
    userMessageId: data.user_message_id,
    assistantMessageId: data.assistant_message_id,
    answer: data.answer,
    isEmergency: data.is_emergency,
    cards: data.cards ?? [],
    disclaimer: data.disclaimer,
  };
}

export async function fetchConversations(
  scanId?: number,
): Promise<ChatConversationSummary[]> {
  const qs = scanId ? `?scan_id=${scanId}` : "";
  const response = await apiFetch(
    `${getApiBaseUrl()}/health-assistant/conversations${qs}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as {
    items: Array<{
      id: number;
      user_id: number;
      scan_id: number | null;
      created_at: string;
      message_count: number;
      preview: string | null;
    }>;
  };
  return data.items.map((item) => ({
    id: item.id,
    userId: item.user_id,
    scanId: item.scan_id,
    createdAt: item.created_at,
    messageCount: item.message_count,
    preview: item.preview,
  }));
}

export async function fetchConversation(
  conversationId: number,
): Promise<ChatConversationDetail> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/health-assistant/conversations/${conversationId}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as {
    id: number;
    user_id: number;
    scan_id: number | null;
    created_at: string;
    messages: Array<{
      id: number;
      conversation_id: number;
      sender: string;
      message: string;
      created_at: string;
    }>;
  };
  return {
    id: data.id,
    userId: data.user_id,
    scanId: data.scan_id,
    createdAt: data.created_at,
    messages: data.messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      sender: m.sender === "user" ? "user" : "assistant",
      message: m.message,
      createdAt: m.created_at,
    })),
  };
}

export async function deleteConversation(conversationId: number): Promise<void> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/health-assistant/conversations/${conversationId}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(await parseError(response));
  }
}

export async function clearConversation(conversationId: number): Promise<void> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/health-assistant/conversations/${conversationId}/clear`,
    { method: "POST" },
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(await parseError(response));
  }
}

export async function exportConversation(conversationId: number): Promise<Blob> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/health-assistant/conversations/${conversationId}/export`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.blob();
}

export async function fetchKnowledgeTopics(): Promise<KnowledgeTopic[]> {
  const response = await apiFetch(`${getApiBaseUrl()}/health-assistant/knowledge`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  const data = (await response.json()) as { items: KnowledgeTopic[] };
  return data.items;
}
