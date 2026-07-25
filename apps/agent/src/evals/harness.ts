// flue-blueprint: tooling/vitest-evals@1
import { createFlueClient } from "@flue/sdk";
import { createHarness, toJsonValue } from "vitest-evals";

import type { AgentPromptResponse, FlueConversationMessage } from "@flue/sdk";
import type { JsonValue, TranscriptEvent, UsageSummary } from "vitest-evals";

/** How an eval run reaches one agent of a running Flue application. */
export interface FlueAgentHarnessOptions {
  /** Agent name as the Flue app registers it, e.g. `support-assistant`. */
  agentName: string;
  /** Base URL of the running app. Falls back to `FLUE_BASE_URL`, then to `flue dev`'s own default. */
  baseUrl?: string;
  /** Bearer token, when the agent's route is protected. */
  token?: string;
  /** Extra headers merged into every request the SDK makes. */
  headers?: Record<string, string>;
}

// Where the SDK looks when neither the caller nor the environment names a host.
// This is `flue dev`'s own default port, so an unconfigured harness and an
// unconfigured dev server meet without either side being told anything.
const DEFAULT_BASE_URL = "http://127.0.0.1:3583";

// Tool input and output cross the wire as `unknown`, and the transcript wants a
// JSON-safe record. A value that survives the JSON round trip but is not a plain
// object is wrapped rather than dropped, so a malformed call still shows up in
// the report instead of silently becoming an argument-less tool call.
function toArguments(input: unknown): Record<string, JsonValue> | undefined {
  const value = toJsonValue(input);
  if (value === undefined) return undefined;
  const isRecord = typeof value === "object" && value !== null && !Array.isArray(value);
  return isRecord ? value : { input: value };
}

// One tool part becomes the call event plus, once the tool has settled, the
// result event that `toolCalls(result)` pairs with it to report `ok` or `error`.
function toToolEvents(
  part: Extract<FlueConversationMessage["parts"][number], { type: "dynamic-tool" }>,
): TranscriptEvent[] {
  const call: TranscriptEvent = {
    type: "tool_call",
    id: part.toolCallId,
    name: part.toolName,
    ...(toArguments(part.input) ? { arguments: toArguments(part.input) } : {}),
  };
  if (part.state === "output-available") {
    return [
      call,
      {
        type: "tool_result",
        toolCallId: part.toolCallId,
        name: part.toolName,
        content: toJsonValue(part.output),
      },
    ];
  }
  if (part.state === "output-error") {
    return [
      call,
      {
        type: "tool_result",
        toolCallId: part.toolCallId,
        name: part.toolName,
        error: { message: part.errorText },
      },
    ];
  }
  return [call];
}

// A conversation message flattens into the transcript events an assertion reads.
//
// `reasoning` parts are deliberately left out. They carry the model's private
// deliberation, not its reply, and a reasoning model will happily think out loud
// about a status it then correctly declines to state - so admitting them here
// would let a transcript-level assertion fail an agent that behaved perfectly.
// The reply itself is the harness `output`; tool activity is the events below.
function toTranscriptEvents(message: FlueConversationMessage): TranscriptEvent[] {
  return message.parts.flatMap((part): TranscriptEvent[] => {
    if (part.type === "text") {
      return [{ type: "message", role: message.role, content: part.text }];
    }
    if (part.type === "dynamic-tool") return toToolEvents(part);
    return [];
  });
}

// Flue reports cost alongside tokens; `UsageSummary` has no cost field of its
// own, and its `metadata` bag is documented as where cost estimates belong.
function toUsageSummary(response: AgentPromptResponse): UsageSummary {
  return {
    provider: response.model.provider,
    model: response.model.id,
    inputTokens: response.usage.input,
    outputTokens: response.usage.output,
    totalTokens: response.usage.totalTokens,
    metadata: { cost: response.usage.cost.total },
  };
}

/**
 * Builds a `vitest-evals` harness that drives one agent across the application's
 * public HTTP boundary through `@flue/sdk` - the same door a browser uses - so an
 * eval exercises the deployed contract rather than any runtime internal.
 *
 * A fresh agent instance is minted per `run(...)`, so cases never contaminate one
 * another. Evaluate conversation memory only in a harness that deliberately
 * reuses an instance.
 *
 * @param options - which agent to drive and how to reach it.
 */
export function createFlueAgentHarness(options: FlueAgentHarnessOptions) {
  const client = createFlueClient({
    baseUrl: options.baseUrl ?? process.env.FLUE_BASE_URL ?? DEFAULT_BASE_URL,
    token: options.token,
    headers: options.headers,
  });

  return createHarness<string, string>({
    name: `flue-${options.agentName}-agent`,
    run: async ({ input, signal }) => {
      const instanceId = `eval-${crypto.randomUUID()}`;
      // The awaited prompt settles only once its canonical conversation records
      // are persisted, so the history read below sees the completed turn.
      const invocation = await client.agents.prompt(options.agentName, instanceId, {
        message: input,
        signal,
      });
      const history = await client.agents.history(options.agentName, instanceId, {
        signal,
      });

      return {
        output: invocation.result.text,
        events: history.messages.flatMap(toTranscriptEvents),
        usage: toUsageSummary(invocation.result),
      };
    },
  });
}
