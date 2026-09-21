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
