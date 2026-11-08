import { CHAT_SYSTEM, CHAT_USER } from './chat.js';
import { CLASSIFIER_SYSTEM, CLASSIFIER_USER } from './classifier.js';
import { EXTRACTOR_SYSTEM, EXTRACTOR_USER } from './extractor.js';
import { OPTION_MODIFIER_SYSTEM, OPTION_MODIFIER_USER } from './option-modifier.js';
import { PRODUCT_RECOMMENDER_SYSTEM, PRODUCT_RECOMMENDER_USER } from './product-recommender.js';

/**
 * Agent prompt keys and their v1 content. Everything here is seeded into `prompt_templates` and read back from
 * the DB at call time, so a prompt can be improved from the app without a redeploy. The files are the source of
 * a *new version*, never of what is currently running.
 */

export const AGENT_PROMPT_KEYS = [
  'agent.extract.system',
  'agent.extract.user',
  'agent.classify.system',
  'agent.classify.user',
  'agent.recommend.system',
  'agent.recommend.user',
  'agent.options.system',
  'agent.options.user',
  'agent.chat.system',
  'agent.chat.user',
] as const;
export type AgentPromptKey = (typeof AGENT_PROMPT_KEYS)[number];

/**
 * Version of each prompt. Bump a key here in the same commit that changes its text: the seeder inserts the new
 * version and activates it in place of the seeded one it replaces, so a redeploy actually ships the new wording.
 * (A prompt written from the app always lands on a version above these and is never overwritten.)
 */
export const AGENT_PROMPT_VERSIONS: Readonly<Record<AgentPromptKey, number>> = {
  'agent.extract.system': 1,
  'agent.extract.user': 1,
  'agent.classify.system': 1,
  'agent.classify.user': 1,
  // v2: fill the per-category quota instead of only the gaps, and give every new product its own options.
  // v3: keep writing options for the products at the END of a long answer, not just the first few.
  // v4: a drink is a plain panel row — no description, no options (D-175).
  // v5: write Turkish characters; a card the expert reads out loud should not say "Karisik Atistirmalik".
  // v6: 6–8 word descriptions; only PACKAGED drinks are plain rows, prepared ones get options (D-178, D-179).
  // v7: no platform name and no branch-opening wording — the app stands on its own (D-197).
  // v8: only what THIS kitchen can make, and alternatives built on the menu's own products with `basedOn` (D-198).
  // v9: an alternative's name is plain — the menu product's size words ("Tam Ekmek") stay out of it (D-198).
  // v10: the rep opens a delivery platform branch and leads the call; the proactive stance replaces D-197's neutral one (D-200).
  // v11: the platform is not named — "bir yemek sipariş platformu" (D-203).
  'agent.recommend.system': 11,
  // v3: the products the team kept turning down for this cuisine are named, so they are not proposed (D-194).
  // v4: …as what sellers mostly turned down, to propose only when nothing better fits (D-196).
  // v5: "menü hedefi" instead of an opening target (D-197).
  // v6: the kitchen brief (what the menu makes, the specialities it does not show) and the alternatives count (D-198).
  'agent.recommend.user': 6,
  // v2: an unknown option set is not a reason to stay silent — answer for every product that was asked about.
  // v3: drinks never reach this agent.
  // v4: four sections per product (options, removable, extras, 6–8 word description), grounded in the product-type
  //     guide; groups the type can never have are named (D-179).
  // v5: no platform name and no branch-opening wording (D-197).
  // v6: the rep opens a delivery platform branch; every product should leave the call with options and extras (D-200).
  'agent.options.system': 6,
  // v3: each product carries its type, and the batch carries the type guide.
  'agent.options.user': 3,
  // v2: an objection is answered with the sentence to read out.
  // v3: the platform is not named — "bir yemek sipariş platformu" (D-203).
  'agent.chat.system': 3,
  'agent.chat.user': 1,
};

export const AGENT_PROMPTS: Readonly<Record<AgentPromptKey, string>> = {
  'agent.extract.system': EXTRACTOR_SYSTEM,
  'agent.extract.user': EXTRACTOR_USER,
  'agent.classify.system': CLASSIFIER_SYSTEM,
  'agent.classify.user': CLASSIFIER_USER,
  'agent.recommend.system': PRODUCT_RECOMMENDER_SYSTEM,
  'agent.recommend.user': PRODUCT_RECOMMENDER_USER,
  'agent.options.system': OPTION_MODIFIER_SYSTEM,
  'agent.options.user': OPTION_MODIFIER_USER,
  'agent.chat.system': CHAT_SYSTEM,
  'agent.chat.user': CHAT_USER,
};
