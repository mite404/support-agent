import type * as FlueReact from "@flue/react";
import type { FlueConversationMessage, UseFlueAgentOptions, UseFlueAgentResult } from "@flue/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Chat from "../src/app/support/Chat";

// `vi.hoisted` runs before the imports above, which is the only way the factory
// passed to `vi.mock` (also hoisted) and the test bodies can share one spy.
const { useFlueAgent } = vi.hoisted(() => ({
  useFlueAgent: vi.fn<(options: UseFlueAgentOptions) => UseFlueAgentResult>(),
}));

// Partial mock on purpose: only the transport-owning hook is faked, so every
// other export - and the whole primitive composition below it - stays real.
// Note what this does NOT cover: faking `useFlueAgent` removes the only consumer
// of `FlueProvider`'s context, so deleting the provider from `Chat` leaves these
// cases green. The provider-to-consumer handshake is unexercised here.
vi.mock("@flue/react", async (importOriginal) => ({
  ...(await importOriginal<typeof FlueReact>()),
  useFlueAgent,
}));

const messages: FlueConversationMessage[] = [
  {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "where is order #1234", state: "done" }],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [{ type: "text", text: "Order #1234 is shipped.", state: "done" }],
  },
];

const snapshot: UseFlueAgentResult = {
  messages,
  status: "idle",
  historyReady: true,
  error: undefined,
  failedSends: [],
  sendMessage: async () => {},
};

// Alignment lives on the bubble element rather than the text node, so walk up to
// the slot the `Bubble` primitive marks and read the attribute the variant styles
// select on. `closest` is generic; naming HTMLElement gives `dataset` without a cast.
function alignOf(text: string): string | undefined {
  return screen.getByText(text).closest<HTMLElement>("[data-slot=bubble]")?.dataset.align;
}

// Testing Library only self-registers cleanup when vitest globals are on. They are
// off here, so unmount explicitly or the next `getByText` matches two renders.
afterEach(cleanup);

beforeEach(() => {
  useFlueAgent.mockReset();
  useFlueAgent.mockReturnValue(snapshot);
});

describe("Chat", () => {
  // The composition this guards is invisible to both the type checker and the
  // linter: `Chat` nests the message-scroller, message, and bubble primitives
  // inside one another, and any of them needing a parent context it does not get
  // throws at mount - exactly how the `<label>` regression shipped.
  test("renders both sides of the transcript", () => {
    render(<Chat userId="u1" />);

    expect(screen.getByText("where is order #1234")).toBeDefined();
    expect(screen.getByText("Order #1234 is shipped.")).toBeDefined();
  });

  test("puts the customer on the trailing edge and the assistant on the leading edge", () => {
    render(<Chat userId="u1" />);

    expect(alignOf("where is order #1234")).toBe("end");
    expect(alignOf("Order #1234 is shipped.")).toBe("start");
  });

  // The lane prefix is load-bearing, not cosmetic: the agent's `route` authorizes
  // on it, and it is what keeps the WhatsApp-only `send_reply` tool from firing on
  // a browser session. A dropped prefix would still render a working-looking chat.
  test("derives the durable session key from the signed-in user", () => {
    render(<Chat userId="u1" />);

    const options = useFlueAgent.mock.calls[0]?.[0];

    expect(options?.id).toBe("web:u1");
    expect(options?.name).toBe("support-assistant");
  });

  test("holds Send closed until the customer has typed something", () => {
    render(<Chat userId="u1" />);

    // No jest-dom here, so read the property directly; naming the element type
    // keeps `disabled` reachable without a cast.
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Send" }).disabled).toBe(true);
  });
});
