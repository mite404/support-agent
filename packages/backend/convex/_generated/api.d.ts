/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as orderStatus from "../orderStatus.js";
import type * as orders from "../orders.js";
import type * as outbox from "../outbox.js";
import type * as outboxStatus from "../outboxStatus.js";
import type * as privateData from "../privateData.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as ticketStatus from "../ticketStatus.js";
import type * as tickets from "../tickets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  healthCheck: typeof healthCheck;
  http: typeof http;
  orderStatus: typeof orderStatus;
  orders: typeof orders;
  outbox: typeof outbox;
  outboxStatus: typeof outboxStatus;
  privateData: typeof privateData;
  seed: typeof seed;
  seedData: typeof seedData;
  ticketStatus: typeof ticketStatus;
  tickets: typeof tickets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
