import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Button } from "@support-agent/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@support-agent/ui/components/dropdown-menu";
import { Toaster } from "@support-agent/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@support-agent/ui/components/tooltip";

afterEach(cleanup);

// The components that render somewhere other than where they are written: both
// the menu and the tooltip put their content through a portal, so "does it
// mount" is a question about two trees rather than one. Each is opened with
// `defaultOpen` because a closed overlay renders nothing at all - a suite that
// only mounted the trigger would prove almost nothing about the popup.

describe("DropdownMenu", () => {
  // `DropdownMenuLabel` wraps Base UI's `Menu.GroupLabel`, which *requires* a
  // `Menu.Group` or `Menu.RadioGroup` ancestor and throws without one:
  //   "Base UI: MenuGroupContext is missing."
  // That is the exact shape of the `<label>` bug this suite exists for, so the
  // label is deliberately rendered inside its group here rather than beside it.
  // `apps/web/src/components/user-menu.tsx` already nests it correctly; this
  // pins the requirement so a future edit that lifts it out fails here first.
  test("mounts an open menu with every part", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger render={<Button variant="outline" />}>My Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Signed in</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              Settings
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Sign Out</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("button", { name: "My Account" })).toBeDefined();
    expect(screen.getByText("Signed in")).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Settings/u })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Sign Out" }).dataset.variant).toBe("destructive");
  });

  // Both indicator items render their check inside a wrapper span that exists
  // whether or not the item is selected, while the tick itself is conditional.
  // Selecting on the item's role and state keeps this independent of that.
  test("mounts checkbox and radio items in their required groups", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Compact</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="light">
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menuitemcheckbox", { name: "Compact" }).ariaChecked).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "Light" }).ariaChecked).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "Dark" }).ariaChecked).toBe("false");
  });

  // `DropdownMenuSubContent` is `DropdownMenuContent` with different defaults,
  // so it carries a second portal inside the first. Only the trigger is
  // observable while the submenu is closed, which is the state that matters:
  // the submenu must mount without opening.
  //
  // The second case adds `DropdownMenuPortal`, the one export in this family
  // that nothing in `apps/web` uses yet. It is not interchangeable with the
  // portal `DropdownMenuContent` already opens - it needs a menu root above it
  // and is how a caller relocates submenu content - so the only way to know it
  // still mounts is to mount it.
  test.each([
    ["without an explicit portal", false],
    ["through an explicit portal", true],
  ])("mounts a closed submenu %s", (_name, portaled) => {
    const subContent = (
      <DropdownMenuSubContent>
        <DropdownMenuItem>As CSV</DropdownMenuItem>
      </DropdownMenuSubContent>
    );

    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
            {portaled ? <DropdownMenuPortal>{subContent}</DropdownMenuPortal> : subContent}
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menuitem", { name: "Export" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "As CSV" })).toBeNull();
  });

  test("renders nothing while closed", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>My Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Sign Out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("button", { name: "My Account" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Sign Out" })).toBeNull();
  });
});

describe("Tooltip", () => {
  test("mounts an open tooltip inside its provider", () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger render={<Button variant="ghost" />}>Order status</TooltipTrigger>
          <TooltipContent>Read live from the orders table</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Order status" })).toBeDefined();
    expect(screen.getByText("Read live from the orders table")).toBeDefined();
  });

  // Measured, not assumed: Base UI's `Tooltip.Provider` only shares a delay
  // between tooltips, so unlike the menu's group context it is genuinely
  // optional. Worth pinning - a caller who drops the provider should get a
  // working tooltip, not the `<label>` crash.
  test("mounts standalone, with no surrounding provider", () => {
    render(
      <Tooltip defaultOpen>
        <TooltipTrigger>Order status</TooltipTrigger>
        <TooltipContent>Read live from the orders table</TooltipContent>
      </Tooltip>,
    );

    expect(screen.getByText("Read live from the orders table")).toBeDefined();
  });

  test("renders no content while closed", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Order status</TooltipTrigger>
          <TooltipContent>Read live from the orders table</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.queryByText("Read live from the orders table")).toBeNull();
  });
});

describe("Toaster", () => {
  // `providers.tsx` mounts this at the app root with no `next-themes` provider
  // guaranteed above it, and `useTheme` falls back to its own default context
  // rather than throwing - so rendering it bare is the real integration, not a
  // simplification. It needs `window.matchMedia`, which jsdom does not
  // implement; see `tests/setup.ts`.
  test("mounts its live region with no theme provider above it", () => {
    render(<Toaster richColors />);

    expect(screen.getByRole("region", { name: /Notifications/u })).toBeDefined();
  });
});
