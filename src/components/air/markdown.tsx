"use client";

import ReactMarkdown from "react-markdown";

/** Renders GenAI markdown output with the .ai-markdown styling. */
export function AiMarkdown({ children }: { children: string }) {
  return (
    <div className="ai-markdown text-sm text-foreground/90">
      <ReactMarkdown
        components={{
          // Never render raw headings oversized inside chat/cards
          h1: ({ children }) => <h3 className="mt-3 mb-1.5 font-semibold">{children}</h3>,
          h2: ({ children }) => (
            <h3 className="mt-4 mb-1.5 border-b border-border pb-1 font-semibold text-sm uppercase tracking-wide text-primary">
              {children}
            </h3>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
