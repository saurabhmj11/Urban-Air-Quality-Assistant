"use client";

/**
 * Coach chat tab — free-text conversation with the context-grounded GenAI
 * coach (live AQI + family profile injected server-side). Optimistic
 * user-turn rendering, auto-scroll and quick prompts.
 */

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AiMarkdown } from "@/components/air/markdown";
import { ChatTurn } from "@/components/air/types";
import { postJson, userMessage } from "@/lib/client";

const QUICK_PROMPTS = [
  "Can my kids play outside this evening?",
  "Best time for my morning walk tomorrow?",
  "How do I set up a low-cost clean air room?",
  "Should we commute by bike or metro today?",
];

export function ChatTab({
  cityId,
  cityName,
  aqi,
  aqiLabel,
}: {
  cityId: string;
  cityName: string;
  aqi: number | null;
  aqiLabel: string | null;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    const next: ChatTurn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setBusy(true);
    try {
      const data = await postJson<{ reply: string }>("/api/chat", {
        city: cityId,
        messages: next,
      });
      if (!data.reply) throw new Error("Chat failed");
      setTurns([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(userMessage(e, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-[calc(100vh-13rem)] min-h-[30rem] flex-col">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          BreathEasy Coach
          <span className="ml-auto hidden text-xs font-normal text-muted-foreground sm:block">
            {cityName}
            {aqi != null && (
              <>
                {" "}
                · AQI {aqi} ({aqiLabel}) · knows your family profile
              </>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div
          ref={scrollRef}
          className="custom-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
          role="log"
          aria-live="polite"
        >
          {turns.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Bot className="h-6 w-6" />
              </span>
              <div>
                <p className="font-semibold">Ask me anything about today&apos;s smog</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  I track the live AQI in {cityName} and your saved family profile to give you
                  personalised, low-emission advice.
                </p>
              </div>
              <div className="mt-1 flex max-w-md flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 ${t.role === "user" ? "justify-end" : ""}`}
            >
              {t.role === "assistant" && (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  t.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border bg-card"
                }`}
              >
                {t.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm">{t.content}</p>
                ) : (
                  <AiMarkdown>{t.content}</AiMarkdown>
                )}
              </div>
              {t.role === "user" && (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <User className="h-4 w-4" />
                </span>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border bg-card px-4 py-3">
                <span className="typing-dot h-2 w-2 rounded-full bg-primary" />
                <span className="typing-dot h-2 w-2 rounded-full bg-primary" />
                <span className="typing-dot h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="e.g. When should I take my asthmatic son to the park?"
            className="max-h-32 min-h-[44px] flex-1 resize-none"
            rows={1}
            aria-label="Message the coach"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={busy || !input.trim()} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
