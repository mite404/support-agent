import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@support-agent/ui/components/attachment";

afterEach(cleanup);

// A file chip - the shape a receipt or screenshot would take in the transcript.
// It gets its own file because it is the largest family in this package and
// because almost all of its styling is *inherited*: every child selects on a
// `group-data-[...]/attachment` attribute owned by the root, so the parts only
// mean anything in composition and the attributes are load-bearing rather than
// decorative.

// The full composition, reused so each case renders what a caller would really
// write instead of an isolated part.
function renderChip(props: React.ComponentProps<typeof Attachment> = {}) {
  return render(
    <AttachmentGroup>
      <Attachment {...props}>
        <AttachmentMedia />
        <AttachmentContent>
          <AttachmentTitle>receipt.pdf</AttachmentTitle>
          <AttachmentDescription>128 KB</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove receipt.pdf" />
        </AttachmentActions>
        <AttachmentTrigger>Open receipt.pdf</AttachmentTrigger>
      </Attachment>
    </AttachmentGroup>,
  );
}

describe("Attachment", () => {
  test("mounts every part in one composition", () => {
    renderChip();

    expect(screen.getByText("receipt.pdf")).toBeDefined();
    expect(screen.getByText("128 KB")).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove receipt.pdf" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Open receipt.pdf" })).toBeDefined();
  });

  // The upload lifecycle is expressed only as an attribute: `AttachmentTitle`
  // shimmers on `group-data-[state=uploading]`, `AttachmentMedia` turns
  // destructive on `group-data-[state=error]`. Nothing re-renders between
  // states, so if the root stopped emitting this the chip would look permanently
  // idle while reporting a failure.
  test.each(["idle", "uploading", "processing", "error", "done"] as const)(
    "publishes the %s state its children style themselves from",
    (state) => {
      const { container } = renderChip({ state });

      const root = container.querySelector<HTMLElement>("[data-slot=attachment]");
      expect(root?.dataset.state).toBe(state);
    },
  );

  test.each(["default", "sm", "xs"] as const)("publishes the %s size", (size) => {
    const { container } = renderChip({ size });

    expect(container.querySelector<HTMLElement>("[data-slot=attachment]")?.dataset.size).toBe(size);
  });

  test.each(["horizontal", "vertical"] as const)("publishes the %s orientation", (orientation) => {
    const { container } = renderChip({ orientation });

    expect(
      container.querySelector<HTMLElement>("[data-slot=attachment]")?.dataset.orientation,
    ).toBe(orientation);
  });

  // `orientation` is nullable in the variant props, and the component resolves
  // `null` back to "horizontal" by hand before writing the attribute. Without
  // that fallback the layout selectors would match nothing at all.
  test("falls back to a horizontal orientation when given none", () => {
    const { container } = renderChip({ orientation: null });

    expect(
      container.querySelector<HTMLElement>("[data-slot=attachment]")?.dataset.orientation,
    ).toBe("horizontal");
  });

  test.each(["icon", "image"] as const)("mounts the %s media variant", (variant) => {
    const { container } = render(
      <Attachment>
        <AttachmentMedia variant={variant} />
      </Attachment>,
    );

    const media = container.querySelector<HTMLElement>("[data-slot=attachment-media]");
    expect(media?.dataset.variant).toBe(variant);
  });
});

describe("AttachmentAction", () => {
  // It wraps `Button`, and the wrapper's whole job is to default `type` to
  // "button" and the variant to "ghost". A chip inside a form whose remove
  // control defaulted to `type="submit"` would send the composer on click.
  test("defaults to a non-submitting button", () => {
    render(
      <Attachment>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove" />
        </AttachmentActions>
      </Attachment>,
    );

    const action = screen.getByRole<HTMLButtonElement>("button", { name: "Remove" });
    expect(action.type).toBe("button");
    expect(action.dataset.slot).toBe("attachment-action");
  });
});

describe("AttachmentTrigger", () => {
  // Built through Base UI's `useRender`, so - like `BubbleContent` and `Marker` -
  // a bad render prop fails at mount rather than at compile time. It is also
  // the one part that spans the whole chip (`absolute inset-0`), so swapping it
  // for a link is the expected way to make a chip navigate.
  test("mounts as a plain button by default", () => {
    render(
      <Attachment>
        <AttachmentTrigger>Open receipt.pdf</AttachmentTrigger>
      </Attachment>,
    );

    const trigger = screen.getByRole<HTMLButtonElement>("button", { name: "Open receipt.pdf" });
    expect(trigger.type).toBe("button");
    expect(trigger.dataset.slot).toBe("attachment-trigger");
  });

  test("honors the render prop that swaps its host element", () => {
    render(
      <Attachment>
        <AttachmentTrigger render={<a href="/files/receipt.pdf">Open receipt.pdf</a>} />
      </Attachment>,
    );

    // The host became the anchor and kept the slot, proving the merge ran. The
    // component also stops forcing `type="button"` once a render element is
    // supplied, which is what keeps an invalid `type` off the anchor.
    const trigger = screen.getByRole<HTMLAnchorElement>("link", { name: "Open receipt.pdf" });
    expect(trigger.dataset.slot).toBe("attachment-trigger");
    expect(trigger.getAttribute("type")).toBeNull();
  });
});
