import { HAMUR_EV_TEMPLATES } from './templates-hamur-ev.js';
import { KEBAP_DONER_TEMPLATES } from './templates-kebap-doner.js';
import { TATLI_DIGER_TEMPLATES } from './templates-tatli-diger.js';
import type { SeedTemplate } from './template-types.js';

/** The 40 ready-made Turkish templates (source='seed', approved=true) that make Stage B useful from day one. */
export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  ...KEBAP_DONER_TEMPLATES,
  ...HAMUR_EV_TEMPLATES,
  ...TATLI_DIGER_TEMPLATES,
];
