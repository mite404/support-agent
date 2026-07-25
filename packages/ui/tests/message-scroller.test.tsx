import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@support-agent/ui/components/message-scroller";

afterEach(cleanup);

// The transcript container, and the only family in this package built on a
// required provider - which makes it the closest living relative of the
// `<label>` bug: five of its six parts read a context that `MessageScroller` on
// its own does not supply. Every case below therefore renders the whole stack
// in the order `apps/web/src/app/support/Chat.tsx` uses it, scroll button
// inside the viewport included.
//
// These are mount tests, not scroll tests. jsdom reports every element as
// zero-height and implements no scrolling, so the button's active state and the
// autoscroll behaviour are not observable here; they belong to the manual
// browser pass (`docs/MANUAL-BROWSER-PASS.md`).

function renderTranscript(lines: readonly string[]) {
  return render(
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport aria-label="Support conversation">
          <MessageScrollerContent>
            {lines.map((line) => (
              <MessageScrollerItem key={line}>{line}</MessageScrollerItem>
            ))}
          </MessageScrollerContent>
          <MessageScrollerButton direction="end" />
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>,
  );
}

describe("MessageScroller", () => {
  test("mounts the whole stack and renders its items", () => {
    renderTranscript(["where is order #1234", "Your order has shipped."]);

    expect(screen.getByText("where is order #1234")).toBeDefined();
    expect(screen.getByText("Your order has shipped.")).toBeDefined();
  });

  // The viewport is the scrollable element and the only one a screen reader
  // should land on, so the label the chat surface gives it has to reach the DOM
  // rather than being swallowed by the primitive.
  test("labels the viewport for assistive technology", () => {
    const { container } = renderTranscript(["where is order #1234"]);

    const viewport = screen.getByLabelText("Support conversation");
    expect(viewport.dataset.slot).toBe("message-scroller-viewport");
    expect(container.querySelector("[data-slot=message-scroller-content]")).not.toBeNull();
  });

  test("mounts an empty transcript, before the first message", () => {
    const { container } = renderTranscript([]);

    expect(container.querySelector("[data-slot=message-scroller-content]")).not.toBeNull();
    expect(container.querySelectorAll("[data-slot=message-scroller-item]")).toHaveLength(0);
  });
});

describe("MessageScrollerButton", () => {
  // The button renders no visible text - its accessible name comes from an
  // `sr-only` span chosen by direction, and its icon is rotated with CSS. So the
  // name is the only thing distinguishing the two directions to a screen reader,
  // and it is computed in the component rather than passed in.
  test.each([
    ["end", "Scroll to end"],
    ["start", "Scroll to start"],
  ] as const)("names its %s direction for assistive technology", (direction, name) => {
    render(
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent />
            <MessageScrollerButton direction={direction} />
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>,
    );

    const button = screen.getByRole("button", { name });
    expect(button.dataset.direction).toBe(direction);
  });

  // It defaults to rendering *through* `Button`, so the design system's button
  // styles apply to it. That indirection is invisible in the type signature -
  // the `render` prop defaults to `<Button variant size />` inside the
  // component - and a caller passing their own render element replaces it.
  test("renders through the design system's button by default", () => {
    render(
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent />
            <MessageScrollerButton />
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>,
    );

    // One element carries both slots, which only happens if the scroller button
    // merged into the `Button` element rather than nesting or discarding it.
    const button = screen.getByRole("button", { name: "Scroll to end" });
    expect(button.dataset.slot).toBe("message-scroller-button");
    expect(button.className).toContain("cn-message-scroller-button");
  });

  test("accepts its own children in place of the default icon", () => {
    render(
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent />
            <MessageScrollerButton>Jump to latest</MessageScrollerButton>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>,
    );

    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeDefined();
  });
});
