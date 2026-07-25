import { afterAll, beforeAll, describe, expect, it } from "vitest";

import supportAssistant, {
  description,
  isHttpLaneAuthorized,
} from "../src/agents/support-assistant";

// The default client the agent initializer closes over is built lazily from
// CONVEX_URL. This test does not touch Convex - it only inspects the wired
// config - so a dummy deployment URL is enough to let the client construct
// (ConvexHttpClient validates URL shape, not reachability, at construction).
const priorConvexUrl = process.env.CONVEX_URL;

beforeAll(() => {
  process.env.CONVEX_URL = "https://ralph-loop-test.convex.cloud";
});

afterAll(() => {
  if (priorConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = priorConvexUrl;
  }
});

describe("support-assistant / isHttpLaneAuthorized", () => {
  it("serves the web lane over HTTP", () => {
    expect(isHttpLaneAuthorized("web:user_42")).toBe(true);
  });

  it("refuses the WhatsApp lane over HTTP (it arrives via Twilio dispatch)", () => {
    expect(isHttpLaneAuthorized("whatsapp:+15550001111")).toBe(false);
  });

  it("refuses a missing or unprefixed id", () => {
    // A path with no `:id` segment surfaces as `undefined` from Hono's param.
    const missingId: string | undefined = undefined;
    expect(isHttpLaneAuthorized(missingId)).toBe(false);
    expect(isHttpLaneAuthorized("user_42")).toBe(false);
    expect(isHttpLaneAuthorized("")).toBe(false);
  });
});

describe("support-assistant / definition", () => {
  it("wires the model, instructions, and both id-scoped support tools", async () => {
    const config = await supportAssistant.initialize({
      id: "web:user_42",
      env: {},
    });

    expect(config.model).toBe("openrouter/moonshotai/kimi-k2.6");
    expect(config.instructions).toContain("Never invent");
    expect(config.description).toBe(description);
    expect(config.tools?.map((tool) => tool.name)).toEqual(["lookup_order_status", "send_reply"]);
  });
});
