"use client";

import { FlueProvider, useFlueAgent } from "@flue/react";
import { createFlueClient } from "@flue/sdk";
import { env } from "@support-agent/env/web";
import { Bubble, BubbleContent, BubbleGroup } from "@support-agent/ui/components/bubble";
import { Button } from "@support-agent/ui/components/button";
import { Message, MessageContent } from "@support-agent/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@support-agent/ui/components/message-scroller";
import { Textarea } from "@support-agent/ui/components/textarea";
import * as React from "react";

import { toSupportBubbles } from "./message-view";

// One SDK client for the whole app, mirroring how `providers.tsx` holds a single
// `ConvexReactClient` at module scope. The base URL is the Flue agent process
// (a separate long-lived Node server), never this Next app.
const flueClient = createFlueClient({ baseUrl: env.NEXT_PUBLIC_FLUE_BASE_URL });

// Compose the durable transcript into the shadcn message-scroller: user bubbles
// on the trailing edge (primary), assistant bubbles on the leading edge (muted).
function Conversation({ id }: { id: string }) {
  const [input, setInput] = React.useState("");
  const agent = useFlueAgent({ name: "support-assistant", id });
  const bubbles = toSupportBubbles(agent.messages);
  const canSend = input.trim().length > 0 && agent.status !== "submitted";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    setInput("");
    await agent.sendMessage(text);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Support conversation">
            <MessageScrollerContent>
              {bubbles.map((bubble) => (
                <MessageScrollerItem key={bubble.id}>
                  <Message align={bubble.align}>
                    <MessageContent>
                      <BubbleGroup>
                        <Bubble
                          align={bubble.align}
                          variant={bubble.align === "end" ? "default" : "muted"}
                        >
                          <BubbleContent>{bubble.text}</BubbleContent>
                        </Bubble>
                      </BubbleGroup>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
            <MessageScrollerButton direction="end" />
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about an order, e.g. where is order #1234"
          aria-label="Message the support assistant"
          className="min-h-11 flex-1 resize-none"
        />
        <Button type="submit" disabled={!canSend}>
          Send
        </Button>
      </form>
    </div>
  );
}

/**
 * Web chat surface for the support assistant.
 *
 * Wraps the live conversation in a `FlueProvider` and derives the durable
 * session key from the signed-in user, tagging it with the `web:` lane prefix
 * that the agent's `route` authorizes and that keeps the WhatsApp-only
 * `send_reply` tool from ever firing on a browser session.
 */
export default function Chat({ userId }: { userId: string }) {
  return (
    <FlueProvider client={flueClient}>
      <Conversation id={`web:${userId}`} />
    </FlueProvider>
  );
}
