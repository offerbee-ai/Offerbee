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
import type * as benefitCycles from "../benefitCycles.js";
import type * as benefitParser from "../benefitParser.js";
import type * as benefits from "../benefits.js";
import type * as catalog from "../catalog.js";
import type * as catalogSync from "../catalogSync.js";
import type * as crons from "../crons.js";
import type * as notifications from "../notifications.js";
import type * as offers from "../offers.js";
import type * as push from "../push.js";
import type * as rapidapi from "../rapidapi.js";
import type * as review from "../review.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as validators from "../validators.js";
import type * as verify from "../verify.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  benefitCycles: typeof benefitCycles;
  benefitParser: typeof benefitParser;
  benefits: typeof benefits;
  catalog: typeof catalog;
  catalogSync: typeof catalogSync;
  crons: typeof crons;
  notifications: typeof notifications;
  offers: typeof offers;
  push: typeof push;
  rapidapi: typeof rapidapi;
  review: typeof review;
  users: typeof users;
  utils: typeof utils;
  validators: typeof validators;
  verify: typeof verify;
  wallet: typeof wallet;
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

export declare const components: {};
