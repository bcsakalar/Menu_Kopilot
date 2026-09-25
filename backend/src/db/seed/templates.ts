import { DUNYA_DENIZ_EK_TEMPLATES } from './templates-dunya-deniz-ek.js';
import { EK_GENIS_TEMPLATES } from './templates-ek-genis.js';
import { EV_EK_TEMPLATES } from './templates-ev-ek.js';
import { FASTFOOD_EK_TEMPLATES } from './templates-fastfood-ek.js';
import { HAMUR_EV_TEMPLATES } from './templates-hamur-ev.js';
import { KAHVALTI_KAFE_EK_TEMPLATES } from './templates-kahvalti-kafe-ek.js';
import { KEBAP_DONER_TEMPLATES } from './templates-kebap-doner.js';
import { KOMBO_ICECEK_TEMPLATES } from './templates-kombo-icecek.js';
import { KEBAP_EK_TEMPLATES } from './templates-kebap-ek.js';
import { TATLI_DIGER_TEMPLATES } from './templates-tatli-diger.js';
import { TATLI_SOKAK_EK_TEMPLATES } from './templates-tatli-sokak-ek.js';
import { SHORT_DESCRIPTIONS } from './short-descriptions.js';
import type { SeedTemplate } from './template-types.js';

/**
 * Ready-made Turkish templates (source='seed', approved=true) that make Stage B and the gap recommendations useful
 * from day one: the 40 classics of the first release, then a second wave that covers every platform kitchen category.
 * The same product may appear in several cuisines (e.g. Ayran for kebap, çiğ köfte and ev yemekleri); matching
 * prefers the branch's own cuisine.
 */
const ALL_TEMPLATES: readonly SeedTemplate[] = [
  ...KEBAP_DONER_TEMPLATES,
  ...HAMUR_EV_TEMPLATES,
  ...TATLI_DIGER_TEMPLATES,
  ...KEBAP_EK_TEMPLATES,
  ...EV_EK_TEMPLATES,
  ...TATLI_SOKAK_EK_TEMPLATES,
  ...FASTFOOD_EK_TEMPLATES,
  ...KAHVALTI_KAFE_EK_TEMPLATES,
  ...DUNYA_DENIZ_EK_TEMPLATES,
  // Third wave (D-175): the categories a complete menu needs but the pool was thin on — menü & kampanya (it had
  // none at all), çorba, yan ürün, ara sıcak, tatlı — plus the smallest kitchens and drinks as plain panel rows.
  ...KOMBO_ICECEK_TEMPLATES,
  ...EK_GENIS_TEMPLATES,
];

/**
 * The templates with their panel descriptions: 6–8 words, or empty for a packaged drink (D-178). The dish data
 * above keeps its original long descriptions as the source they were shortened from.
 */
export const SEED_TEMPLATES: readonly SeedTemplate[] = ALL_TEMPLATES.map((t) => {
  const short = SHORT_DESCRIPTIONS[`${t.cuisine}|${t.payload.name}`];
  if (short === undefined) return t;
  // An empty description marks a packaged drink: the whole row is plain on the panel, options included.
  if (short === '') {
    return { ...t, payload: { ...t.payload, description: '', optionGroups: [], removableIngredients: [], extraIngredients: [], upsellSuggestion: '' } };
  }
  return { ...t, payload: { ...t.payload, description: short } };
});
