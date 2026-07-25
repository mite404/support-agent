import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Button } from "@support-agent/ui/components/button";
import { Checkbox } from "@support-agent/ui/components/checkbox";
import { Input } from "@support-agent/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@support-agent/ui/components/input-group";
import { Textarea } from "@support-agent/ui/components/textarea";

// Testing Library only registers its own cleanup when vitest globals are on.
// They are off here, so unmount between cases explicitly.
afterEach(cleanup);

// The controls a customer types into. As in `chat-primitives.test.tsx`, the
// failure these exist to catch is a component that throws while mounting -
// invisible to both the type checker and the linter. Beyond the mount, each
// case asserts the one contract a *stylesheet* depends on: these components
// carry `data-slot` and `data-align` attributes that Tailwind selectors target,
// so a renamed slot compiles, lints, and silently unstyles the composer.

describe("Button", () => {
  test("mounts and exposes its accessible name", () => {
    render(<Button>Send</Button>);

    expect(screen.getByRole("button", { name: "Send" }).dataset.slot).toBe("button");
  });

  // No per-variant cases here, deliberately. `buttonVariants` is a cva map with
  // six variants and eight sizes, and an emptied key yields `undefined` inside
  // `cn` rather than an error - so a mount-and-find assertion passes just as well
  // against a fully broken map, which is what an earlier version of this file did
  // for fourteen cases. Unlike `Bubble` and `Attachment`, `Button` exposes no
  // per-variant `data-*` attribute to pin, so there is nothing cheap and honest to
  // assert. Covering this properly means asserting the emitted class tokens; until
  // then the mount case above is the honest extent of the coverage.

  // The chat composer disables Send while a turn is in flight
  // (`apps/web/src/app/support/Chat.tsx`). Base UI's Button owns that mapping,
  // so this proves the prop still reaches the DOM through the wrapper.
  test("passes the disabled state through to the host element", () => {
    render(<Button disabled>Send</Button>);

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Send" }).disabled).toBe(true);
  });
});

describe("Input", () => {
  test("mounts and accepts a value", () => {
    render(<Input aria-label="Order number" defaultValue="1234" />);

    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Order number" });
    expect(input.value).toBe("1234");
    expect(input.dataset.slot).toBe("input");
  });
});

describe("Textarea", () => {
  test("mounts and accepts a value", () => {
    render(<Textarea aria-label="Message the support assistant" defaultValue="where is 1234" />);

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message the support assistant",
    });
    expect(textarea.value).toBe("where is 1234");
    expect(textarea.dataset.slot).toBe("textarea");
  });
});

describe("Checkbox", () => {
  test("mounts unchecked, with no surrounding field", () => {
    render(<Checkbox aria-label="Email me updates" />);

    expect(screen.getByRole("checkbox", { name: "Email me updates" }).ariaChecked).toBe("false");
  });

  // The indicator is rendered only while checked, so it is a second render path
  // that the unchecked case never reaches. Selecting it by its own slot rather
  // than by the icon keeps this from breaking on a lucide swap.
  test("shows its indicator once checked", () => {
    render(<Checkbox aria-label="Email me updates" defaultChecked />);

    const checkbox = screen.getByRole("checkbox", { name: "Email me updates" });
    expect(checkbox.ariaChecked).toBe("true");
    expect(checkbox.querySelector("[data-slot=checkbox-indicator]")).not.toBeNull();
  });
});

describe("InputGroup", () => {
  test("mounts a control flanked by both addons", () => {
    render(
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>#</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Order number" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Clear" size="icon-xs" />
        </InputGroupAddon>
      </InputGroup>,
    );

    expect(screen.getByRole("textbox", { name: "Order number" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
    expect(screen.getByText("#")).toBeDefined();
  });

  // `InputGroup` styles its focus ring with
  // `has-[[data-slot=input-group-control]:focus-visible]`, and both controls
  // override the slot they inherit from `Input`/`Textarea` to opt into it. If
  // either override is dropped the group keeps rendering and silently stops
  // showing focus, which no other check in this repo would catch.
  test.each([
    ["input", <InputGroupInput key="i" aria-label="Order number" />],
    ["textarea", <InputGroupTextarea key="t" aria-label="Order number" />],
  ])("marks its %s as the group's focus target", (_kind, control) => {
    render(<InputGroup>{control}</InputGroup>);

    expect(screen.getByRole("textbox", { name: "Order number" }).dataset.slot).toBe(
      "input-group-control",
    );
  });

  // The addon's alignment drives flex ordering entirely through this attribute
  // (`order-first` / `order-last` in `inputGroupAddonVariants`), so a leading
  // addon that lost it would render after the control.
  test.each(["inline-start", "inline-end", "block-start", "block-end"] as const)(
    "records the %s alignment its ordering styles select on",
    (align) => {
      const { container } = render(
        <InputGroup>
          <InputGroupAddon align={align}>#</InputGroupAddon>
        </InputGroup>,
      );

      const addon = container.querySelector<HTMLElement>("[data-slot=input-group-addon]");
      expect(addon?.dataset.align).toBe(align);
    },
  );
});
