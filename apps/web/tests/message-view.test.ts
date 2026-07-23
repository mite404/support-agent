import type { FlueConversationMessage } from "@flue/react";
import { describe, expect, it } from "vitest";

import { toSupportBubbles } from "../src/app/support/message-view";

const userMessage: FlueConversationMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "where is order #1234", state: "done" }],
};

const assistantMessage: FlueConversationMessage = {
  id: "m2",
  role: "assistant",
  parts: [
    { type: "reasoning", text: "checking the order", state: "done" },
    { type: "text", text: "Order #1234 is ", state: "done" },
    { type: "text", text: "shipped.", state: "done" },
  ],
};

describe("toSupportBubbles", () => {
  it("aligns the user to the trailing edge and the assistant to the leading edge", () => {
    const bubbles = toSupportBubbles([userMessage, assistantMessage]);

    expect(bubbles.map((bubble) => bubble.align)).toEqual(["end", "start"]);
  });

  it("keeps the durable message id so React can reconcile optimistic echoes", () => {
    const bubbles = toSupportBubbles([userMessage, assistantMessage]);

    expect(bubbles.map((bubble) => bubble.id)).toEqual(["m1", "m2"]);
  });

  it("joins text parts in order and drops reasoning so no placeholder leaks", () => {
    const [, assistant] = toSupportBubbles([userMessage, assistantMessage]);

    expect(assistant?.text).toBe("Order #1234 is shipped.");
  });

  it("renders an empty string when a message has no text part", () => {
    const toolOnly: FlueConversationMessage = {
      id: "m3",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "lookup_order_status",
          toolCallId: "call_1",
          state: "input-available",
          input: { orderNumber: "1234" },
        },
      ],
    };

    const [bubble] = toSupportBubbles([toolOnly]);

    expect(bubble?.text).toBe("");
  });
});
