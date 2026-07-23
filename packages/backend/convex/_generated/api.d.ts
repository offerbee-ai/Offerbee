/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as arrayDelta from "../arrayDelta.js";
import type * as auth from "../auth.js";
import type * as autoApplyGate from "../autoApplyGate.js";
import type * as benefitCycles from "../benefitCycles.js";
import type * as benefitMerchants from "../benefitMerchants.js";
import type * as benefitOverrides from "../benefitOverrides.js";
import type * as benefitParser from "../benefitParser.js";
import type * as benefits from "../benefits.js";
import type * as billing from "../billing.js";
import type * as billingCore from "../billingCore.js";
import type * as cardDataDiff from "../cardDataDiff.js";
import type * as cardExtractionParse from "../cardExtractionParse.js";
import type * as cardFieldMap from "../cardFieldMap.js";
import type * as cardSourceSelect from "../cardSourceSelect.js";
import type * as catalog from "../catalog.js";
import type * as catalogSync from "../catalogSync.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as freshness from "../freshness.js";
import type * as geoService from "../geoService.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as nearby from "../nearby.js";
import type * as nearbyMatch from "../nearbyMatch.js";
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
import type * as provenanceGuard from "../provenanceGuard.js";
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
  arrayDelta: typeof arrayDelta;
  auth: typeof auth;
  autoApplyGate: typeof autoApplyGate;
  benefitCycles: typeof benefitCycles;
  benefitMerchants: typeof benefitMerchants;
  benefitOverrides: typeof benefitOverrides;
  benefitParser: typeof benefitParser;
  benefits: typeof benefits;
  billing: typeof billing;
  billingCore: typeof billingCore;
  cardDataDiff: typeof cardDataDiff;
  cardExtractionParse: typeof cardExtractionParse;
  cardFieldMap: typeof cardFieldMap;
  cardSourceSelect: typeof cardSourceSelect;
  catalog: typeof catalog;
  catalogSync: typeof catalogSync;
  crons: typeof crons;
  email: typeof email;
  freshness: typeof freshness;
  geoService: typeof geoService;
  http: typeof http;
  migrations: typeof migrations;
  nearby: typeof nearby;
  nearbyMatch: typeof nearbyMatch;
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
  provenanceGuard: typeof provenanceGuard;
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
