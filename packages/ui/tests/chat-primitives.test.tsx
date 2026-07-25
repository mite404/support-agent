import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "@support-agent/ui/components/bubble";
import { Label } from "@support-agent/ui/components/label";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@support-agent/ui/components/message";

// Testing Library only registers its own cleanup when vitest globals are on.
// They are off here, so unmount between cases explicitly - otherwise an earlier
// render stays in `document.body` and the next `getByText` matches twice.
afterEach(cleanup);

// These tests deliberately assert almost nothing about styling. The failure they
// exist to catch is a component that throws while mounting, which is invisible
// to both the type checker and the linter - the class of bug that put a crashing
// `<label>` into the app. A passing render *is* the assertion; the queries below
// just prove the render produced the tree a user would actually get.

describe("Bubble", () => {
  test("mounts and shows its content", () => {
    render(
      <Bubble>
        <BubbleContent>where is order 1234</BubbleContent>
      </Bubble>,
    );

    expect(screen.getByText("where is order 1234")).toBeDefined();
  });

  // `BubbleContent` is the one primitive here that does not return plain JSX -
  // it builds its element through Base UI's `useRender`, so a bad `render` prop
  // or a mismatched merge fails at mount rather than at compile time.
  test("honors the render prop that swaps its host element", () => {
    render(
      <Bubble>
        <BubbleContent render={<button type="button">retry</button>} />
      </Bubble>,
    );

    // The host element became the button *and* still carries the slot the
    // bubble's variant styles select on, which is what proves the merge ran
    // rather than the render element simply replacing the component's output.
    expect(screen.getByRole("button", { name: "retry" }).dataset.slot).toBe("bubble-content");
  });

  test("marks the end alignment used for the customer's own messages", () => {
    render(
      <Bubble align="end">
        <BubbleContent>mine</BubbleContent>
      </Bubble>,
    );

    // `closest` is generic; naming HTMLElement gives us `dataset` without an
    // `as` assertion, satisfying both the type checker and oxlint.
    const bubble = screen.getByText("mine").closest<HTMLElement>("[data-slot=bubble]");
    expect(bubble?.dataset.align).toBe("end");
  });

  // Each variant colours the *content* through a descendant selector on the
  // root (`*:data-[slot=bubble-content]:bg-primary`), so the attribute has to
  // survive onto the root or every bubble renders unpainted. `Chat.tsx` picks
  // between "default" and "muted" per speaker; the rest ship for the rebuild.
  test.each([
    "default",
    "secondary",
    "muted",
    "tinted",
    "outline",
    "ghost",
    "destructive",
  ] as const)("publishes the %s variant its content styles select on", (variant) => {
    render(
      <Bubble variant={variant}>
        <BubbleContent>where is order 1234</BubbleContent>
      </Bubble>,
    );

    const bubble = screen
      .getByText("where is order 1234")
      .closest<HTMLElement>("[data-slot=bubble]");
    expect(bubble?.dataset.variant).toBe(variant);
  });
});

describe("BubbleGroup", () => {
  // The stacking wrapper `Chat.tsx` puts around each bubble. It holds no state
  // and takes no provider, so mounting it with its child is the whole contract.
  test("mounts and stacks its bubbles", () => {
    const { container } = render(
      <BubbleGroup>
        <Bubble>
          <BubbleContent>first</BubbleContent>
        </Bubble>
        <Bubble>
          <BubbleContent>second</BubbleContent>
        </Bubble>
      </BubbleGroup>,
    );

    expect(container.querySelector("[data-slot=bubble-group]")).not.toBeNull();
    expect(screen.getByText("first")).toBeDefined();
    expect(screen.getByText("second")).toBeDefined();
  });
});

describe("BubbleReactions", () => {
  // Positioned absolutely off the bubble's corner, so both attributes are pure
  // layout inputs (`top-0 -translate-y-3/4` / `right-3`) with no visible text
  // of their own to fall back on if one goes missing.
  test.each([
    ["top", "start"],
    ["bottom", "end"],
  ] as const)("mounts on the %s %s corner", (side, align) => {
    const { container } = render(
      <Bubble>
        <BubbleContent>shipped</BubbleContent>
        <BubbleReactions side={side} align={align}>
          👍
        </BubbleReactions>
      </Bubble>,
    );

    const reactions = container.querySelector<HTMLElement>("[data-slot=bubble-reactions]");
    expect(reactions?.dataset.side).toBe(side);
    expect(reactions?.dataset.align).toBe(align);
  });
});

describe("Message", () => {
  test("mounts and shows its content", () => {
    render(
      <Message>
        <MessageContent>your order has shipped</MessageContent>
      </Message>,
    );

    expect(screen.getByText("your order has shipped")).toBeDefined();
  });

  // The full row: avatar beside a header/content/footer stack, wrapped in the
  // group that collapses consecutive messages from one speaker. Mounted
  // together because the parts style each other across the tree - the avatar
  // shifts up only when a footer exists
  // (`group-has-data-[slot=message-footer]/message:-translate-y-8`), which is a
  // relationship no isolated render would exercise.
  test("mounts every part in one composition", () => {
    render(
      <MessageGroup>
        <Message align="start">
          <MessageAvatar>SA</MessageAvatar>
          <MessageContent>
            <MessageHeader>Support Assistant</MessageHeader>
            your order has shipped
            <MessageFooter>2 minutes ago</MessageFooter>
          </MessageContent>
        </Message>
      </MessageGroup>,
    );

    expect(screen.getByText("Support Assistant")).toBeDefined();
    expect(screen.getByText("your order has shipped")).toBeDefined();
    expect(screen.getByText("2 minutes ago")).toBeDefined();
    expect(screen.getByText("SA")).toBeDefined();
  });

  // `Chat.tsx` reverses the row for the customer's own messages, and it does so
  // purely through this attribute (`data-[align=end]:flex-row-reverse`). The
  // bubble inside then follows the *message's* alignment via
  // `group-data-[align=end]/message:self-end`, so the two have to agree.
  test.each(["start", "end"] as const)("records the %s alignment on the row", (align) => {
    const { container } = render(
      <Message align={align}>
        <MessageContent>your order has shipped</MessageContent>
      </Message>,
    );

    expect(container.querySelector<HTMLElement>("[data-slot=message]")?.dataset.align).toBe(align);
  });
});

describe("Label", () => {
  // The regression this whole commit exists for. The previous implementation
  // used Base UI's `Field.Label`, which requires a `Field.Root` ancestor and
  // threw when rendered on its own. Nothing wraps this render on purpose: if
  // the primitive ever needs a provider again, this is where it fails.
  test("mounts standalone, with no surrounding provider", () => {
    render(<Label>Message</Label>);

    expect(screen.getByText("Message")).toBeDefined();
  });

  test("associates with the control it names", () => {
    render(
      <>
        <Label htmlFor="composer">Message</Label>
        <textarea id="composer" />
      </>,
    );

    // Resolves only through the label-to-control association, so this fails if
    // the primitive stops rendering a real `<label for=...>`.
    expect(screen.getByLabelText("Message").tagName).toBe("TEXTAREA");
  });
});
