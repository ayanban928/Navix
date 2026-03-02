"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (message: string) => Promise<void>;
}

export function ChatPanel({ messages, isSending, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || isSending) {
      return;
    }
    const next = draft;
    setDraft("");
    await onSend(next);
  }

  return (
    <section className="panel chatPanel">
      <div className="panelHeaderRow">
        <h2>Trip Chat</h2>
        <span className="hint">All messages become structured state transitions.</span>
      </div>
      <div className="chatLog" aria-live="polite">
        {messages.map((message) => (
          <article
            className={`bubble ${message.role === "assistant" ? "assistant" : "user"}`}
            key={message.id}
          >
            <p>{message.content}</p>
          </article>
        ))}
      </div>
      <form className="chatComposer" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Try: Add this Instagram food spot to Day 2"
          aria-label="chat input"
        />
        <button type="submit" disabled={isSending || !draft.trim()}>
          {isSending ? "Applying..." : "Send"}
        </button>
      </form>
    </section>
  );
}
