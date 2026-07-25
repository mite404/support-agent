import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Button } from "@support-agent/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@support-agent/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@support-agent/ui/components/empty";
import { Marker, MarkerContent, MarkerIcon } from "@support-agent/ui/components/marker";
import { Skeleton } from "@support-agent/ui/components/skeleton";

afterEach(cleanup);

// The static surfaces around the transcript: a card summarising an order, the
// empty state before the first message, a day separator inside the thread, and
// the loading placeholder. None of them takes a provider, so a passing render
// here is mostly the assertion - see `chat-primitives.test.tsx` for why that is
// worth its own test at all.

describe("Card", () => {
  // Every part is mounted together rather than one per case: the card's layout
  // is built from `has-data-[slot=...]` selectors on the root, so the parts only
  // mean anything in composition. This is also the shape an order-status card
  // would take.
  test("mounts every part in one composition", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Order #1234</CardTitle>
          <CardDescription>Shipped on 14 November</CardDescription>
          <CardAction>
            <Button size="sm">Track</Button>
          </CardAction>
        </CardHeader>
        <CardContent>Your order has shipped and is on its way.</CardContent>
        <CardFooter>Updated 2 hours ago</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Order #1234")).toBeDefined();
    expect(screen.getByText("Shipped on 14 November")).toBeDefined();
    expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
    expect(screen.getByText("Your order has shipped and is on its way.")).toBeDefined();
    expect(screen.getByText("Updated 2 hours ago")).toBeDefined();
  });

  // `data-size` is what the `sm` spacing cascade keys off
  // (`data-[size=sm]:[--card-spacing:--spacing(3)]`), and it defaults to
  // "default" rather than being omitted.
  test.each(["default", "sm"] as const)("records the %s size on the root", (size) => {
    const { container } = render(<Card size={size}>body</Card>);

    expect(container.querySelector<HTMLElement>("[data-slot=card]")?.dataset.size).toBe(size);
  });
});

describe("Empty", () => {
  test("mounts every part in one composition", () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" />
          <EmptyTitle>No messages yet</EmptyTitle>
          <EmptyDescription>Ask about an order to get started.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button>Ask a question</Button>
        </EmptyContent>
      </Empty>,
    );

    expect(screen.getByText("No messages yet")).toBeDefined();
    expect(screen.getByText("Ask about an order to get started.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeDefined();
  });

  // `EmptyMedia` is the one part with variants, and it emits `data-slot`
  // "empty-icon" for both of them - not "empty-media", which is the name a
  // reader would guess. Pinning it keeps a future rename from being silent.
  test.each(["default", "icon"] as const)("records the %s media variant", (variant) => {
    const { container } = render(<EmptyMedia variant={variant} />);

    const media = container.querySelector<HTMLElement>("[data-slot=empty-icon]");
    expect(media?.dataset.variant).toBe(variant);
  });
});

describe("Marker", () => {
  test("mounts with an icon and content", () => {
    render(
      <Marker>
        <MarkerIcon />
        <MarkerContent>Today</MarkerContent>
      </Marker>,
    );

    expect(screen.getByText("Today")).toBeDefined();
  });

  // `Marker` builds its element through Base UI's `useRender` rather than
  // returning plain JSX, the same construction that makes `BubbleContent` worth
  // testing: a bad `render` prop or a mismatched merge fails at mount, not at
  // compile time. `MarkerContent` then styles itself off the *parent's*
  // variant (`group-data-[variant=separator]/marker:text-center`), so the
  // attribute has to survive onto the host element for the pair to work.
  test.each(["default", "separator", "border"] as const)(
    "publishes the %s variant its content styles select on",
    (variant) => {
      render(
        <Marker variant={variant}>
          <MarkerContent>Today</MarkerContent>
        </Marker>,
      );

      const marker = screen.getByText("Today").closest<HTMLElement>("[data-slot=marker]");
      expect(marker?.dataset.variant).toBe(variant);
    },
  );

  test("honors the render prop that swaps its host element", () => {
    render(<Marker render={<button type="button">Load earlier messages</button>} />);

    // The host became the button *and* kept the slot the variant styles select
    // on, which is what proves the merge ran rather than the render element
    // simply replacing the component's output.
    expect(screen.getByRole("button", { name: "Load earlier messages" }).dataset.slot).toBe(
      "marker",
    );
  });
});

describe("Skeleton", () => {
  // No text and no accessible name to query, so the slot is the only handle -
  // and `querySelector` returns `null` rather than throwing, which is why this
  // asserts `not.toBeNull()` instead of `toBeDefined()`.
  test("mounts standalone", () => {
    const { container } = render(<Skeleton />);

    expect(container.querySelector("[data-slot=skeleton]")).not.toBeNull();
  });
});
