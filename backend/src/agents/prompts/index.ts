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
  'agent.recommend.system': 2,
  'agent.recommend.user': 2,
  // v2: an unknown option set is not a reason to stay silent — answer for every product that was asked about.
  'agent.options.system': 2,
  'agent.options.user': 2,
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
};
