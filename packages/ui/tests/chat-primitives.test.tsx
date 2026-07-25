import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Bubble, BubbleContent } from "@support-agent/ui/components/bubble";
import { Label } from "@support-agent/ui/components/label";
import { Message, MessageContent } from "@support-agent/ui/components/message";

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
