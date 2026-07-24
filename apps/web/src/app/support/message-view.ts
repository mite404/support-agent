import type { FlueConversationMessage, FlueConversationPart } from "@flue/react";

// Which side of the transcript a bubble renders on. The user sits on the
// trailing edge (`end`), the assistant on the leading edge (`start`) - matching
// the `align` prop the `packages/ui` `Message`/`Bubble` primitives expect.
type BubbleAlign = "start" | "end";

// A message flattened to exactly what the chat UI needs to draw one bubble.
// Nothing Flue-specific survives past this boundary, so the view layer never
// reaches into `parts` or branches on `role`.
interface SupportBubbleView {
  id: string;
  align: BubbleAlign;
  text: string;
}

/**
 * Pick the bubble side for a message role.
 *
 * @returns `end` for the user (trailing edge), `start` for the assistant.
 */
function messageAlign(role: FlueConversationMessage["role"]): BubbleAlign {
  return role === "user" ? "end" : "start";
}

/**
 * Concatenate the readable text of a message, ignoring non-text parts.
 *
 * Reasoning, file, and dynamic-tool parts carry no plain reply text, so they
 * fold away here rather than leaking placeholder output into a bubble.
 */
function bubbleText(parts: readonly FlueConversationPart[]): string {
  return parts.reduce((text, part) => (part.type === "text" ? text + part.text : text), "");
}

/**
 * Flatten a Flue transcript into draw-ready bubbles for the chat surface.
 *
 * One bubble per message, keyed by the durable message id so React reconciles
 * an optimistic echo with its canonical copy without remounting.
 */
export function toSupportBubbles(
  messages: readonly FlueConversationMessage[],
): SupportBubbleView[] {
  return messages.map((message) => ({
    id: message.id,
    align: messageAlign(message.role),
    text: bubbleText(message.parts),
  }));
}

export type { BubbleAlign, SupportBubbleView };
