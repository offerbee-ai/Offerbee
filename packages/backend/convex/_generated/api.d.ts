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
import type * as benefitOverrides from "../benefitOverrides.js";
import type * as benefitParser from "../benefitParser.js";
import type * as benefits from "../benefits.js";
import type * as billing from "../billing.js";
import type * as billingCore from "../billingCore.js";
import type * as catalog from "../catalog.js";
import type * as catalogSync from "../catalogSync.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as offers from "../offers.js";
import type * as onboarding from "../onboarding.js";
import type * as onboardingCatalog from "../onboardingCatalog.js";
import type * as plaid from "../plaid.js";
import type * as plaidCardMap from "../plaidCardMap.js";
import type * as plaidDetect from "../plaidDetect.js";
import type * as plaidLlm from "../plaidLlm.js";
import type * as plaidMatch from "../plaidMatch.js";
import type * as plaidNormalize from "../plaidNormalize.js";
import type * as profileName from "../profileName.js";
import type * as push from "../push.js";
import type * as pushQuietHours from "../pushQuietHours.js";
import type * as rapidapi from "../rapidapi.js";
import type * as reminderRules from "../reminderRules.js";
import type * as reminders from "../reminders.js";
import type * as review from "../review.js";
import type * as tips from "../tips.js";
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
  benefitOverrides: typeof benefitOverrides;
  benefitParser: typeof benefitParser;
  benefits: typeof benefits;
  billing: typeof billing;
  billingCore: typeof billingCore;
  catalog: typeof catalog;
  catalogSync: typeof catalogSync;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  migrations: typeof migrations;
  notifications: typeof notifications;
  offers: typeof offers;
  onboarding: typeof onboarding;
  onboardingCatalog: typeof onboardingCatalog;
  plaid: typeof plaid;
  plaidCardMap: typeof plaidCardMap;
  plaidDetect: typeof plaidDetect;
  plaidLlm: typeof plaidLlm;
  plaidMatch: typeof plaidMatch;
  plaidNormalize: typeof plaidNormalize;
  profileName: typeof profileName;
  push: typeof push;
  pushQuietHours: typeof pushQuietHours;
  rapidapi: typeof rapidapi;
  reminderRules: typeof reminderRules;
  reminders: typeof reminders;
  review: typeof review;
  tips: typeof tips;
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

export declare const components: {
  pushNotifications: import("@convex-dev/expo-push-notifications/_generated/component.js").ComponentApi<"pushNotifications">;
};
