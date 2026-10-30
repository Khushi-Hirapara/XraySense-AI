"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Send,
  Settings2,
} from "lucide-react";
import { ChatBubble, type AssistantMessage } from "@/components/health-assistant/ChatBubble";
import { ChatSettingsPanel } from "@/components/health-assistant/ChatSettingsPanel";
import { EmptyState } from "@/components/health-assistant/EmptyState";
import { ErrorState } from "@/components/health-assistant/ErrorState";
import { SuggestedQuestions } from "@/components/health-assistant/SuggestedQuestions";
import { TypingIndicator } from "@/components/health-assistant/TypingIndicator";
import {
  clearConversation,
  deleteConversation,
  exportConversation,
  fetchConversation,
  fetchConversations,
  postHealthChat,
  type ChatConversationSummary,
} from "@/lib/health-assistant";
import { AI_CHAT_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface HealthAssistantChatProps {
  scanId: number;
  /** Compact embed on scan detail vs full-page experience */
  variant?: "embedded" | "page";
  className?: string;
}

export function HealthAssistantChat({
  scanId,
  variant = "embedded",
  className,
}: HealthAssistantChatProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await fetchConversations(scanId);
      setConversations(items);
    } catch {
      // History is non-critical
    }
  }, [scanId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isSending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setError(null);
    setLastFailedMessage(null);
    setIsSending(true);
    const tempId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: trimmed },
    ]);
    setInput("");

    try {
      const result = await postHealthChat({
        message: trimmed,
        scanId,
        conversationId,
      });
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${result.assistantMessageId}`,
          role: "assistant",
          content: result.answer,
          cards: result.cards,
          isEmergency: result.isEmergency,
        },
      ]);
      void refreshHistory();
    } catch (err) {
      setLastFailedMessage(trimmed);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the health assistant. Please try again.",
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleSelectConversation = async (id: number) => {
    setSettingsOpen(false);
    setError(null);
    try {
      const detail = await fetchConversation(id);
      setConversationId(detail.id);
      setMessages(
        detail.messages.map((m) => ({
          id: String(m.id),
          role: m.sender,
          content: m.message,
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load conversation.",
      );
    }
  };

  const handleClearChat = async () => {
    if (conversationId) {
      try {
        await clearConversation(conversationId);
      } catch {
        // Still clear local UI
      }
    }
    setMessages([]);
    setConversationId(null);
    setSettingsOpen(false);
    void refreshHistory();
  };

  const handleExportChat = async () => {
    if (!conversationId) return;
    try {
      const blob = await exportConversation(conversationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carevision-chat-${conversationId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not export chat.",
      );
    }
  };

  const handleDeleteConversation = async (id: number) => {
    try {
      await deleteConversation(id);
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
      }
      void refreshHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete conversation.",
      );
    }
  };

  const isPage = variant === "page";

  return (
    <div
      className={cn(
        "health-assistant",
        darkMode && "health-assistant--dark",
        isPage ? "health-assistant--page" : "health-assistant--embedded",
        className,
      )}
    >
      <header className="health-assistant__header">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg dark:text-white">
              XRaySense AI Health Assistant
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Ask questions about your health report.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="rounded-xl border border-slate-200/90 bg-white/80 p-2 text-slate-500 shadow-sm transition hover:border-teal-200 hover:text-teal-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:border-teal-500/40 dark:hover:text-teal-300"
          aria-label="Open assistant settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </header>

      <div className="border-b border-slate-100/80 px-4 py-3 sm:px-5 dark:border-slate-700/80">
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
          {AI_CHAT_DISCLAIMER}
        </p>
      </div>

      <div className="border-b border-slate-100/80 px-4 py-3 sm:px-5">
        <SuggestedQuestions
          disabled={isSending}
          onSelect={(msg) => void sendMessage(msg)}
        />
      </div>

      <div
        ref={scrollRef}
        className="health-assistant__messages"
        aria-live="polite"
      >
        {error && messages.length === 0 ? (
          <ErrorState
            message={error}
            onRetry={
              lastFailedMessage
                ? () => void sendMessage(lastFailedMessage)
                : undefined
            }
          />
        ) : null}

        {messages.length === 0 && !error ? <EmptyState /> : null}

        <div className="space-y-4">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isSending ? <TypingIndicator /> : null}
        </div>

        {error && messages.length > 0 ? (
          <div className="mt-4">
            <ErrorState
              message={error}
              onRetry={
                lastFailedMessage
                  ? () => void sendMessage(lastFailedMessage)
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="health-assistant__composer">
        <label htmlFor="health-assistant-input" className="sr-only">
          Ask about your health report
        </label>
        <input
          id="health-assistant-input"
          type="text"
          value={input}
          disabled={isSending}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your report, terms, recovery…"
          maxLength={2000}
          className="health-assistant__input"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="health-assistant__send"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>

      <ChatSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectConversation={(id) => void handleSelectConversation(id)}
        onClearChat={() => void handleClearChat()}
        onExportChat={() => void handleExportChat()}
        onDeleteConversation={(id) => void handleDeleteConversation(id)}
        canExport={Boolean(conversationId && messages.length)}
        canClear={messages.length > 0 || conversationId !== null}
      />
    </div>
  );
}
