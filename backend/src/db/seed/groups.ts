import type { PriceMode, TemplateOptionGroup } from '../../domain/template.js';

/**
 * Reusable option-group factories for the seed templates. The user prefers generous groups
 * (4–7 options) — deleting extras is easier than thinking of missing ones.
 */

export type OptionSpec = string | { name: string; mode?: PriceMode; isDefault?: boolean };

function toOptions(specs: readonly OptionSpec[], mode: PriceMode, defaultIndex?: number) {
  return specs.map((spec, index) => {
    const base = typeof spec === 'string' ? { name: spec } : spec;
    return {
      name: base.name,
      priceMode: base.mode ?? mode,
      isDefault: base.isDefault ?? index === defaultIndex,
    };
  });
}

/** Single-choice group. */
export function single(
  name: string,
  options: readonly OptionSpec[],
  config: { required?: boolean; mode?: PriceMode; defaultIndex?: number } = {},
): TemplateOptionGroup {
  const required = config.required ?? false;
  return {
    name,
    selectionType: 'single',
    isRequired: required,
    minSelect: required ? 1 : 0,
    maxSelect: 1,
    options: toOptions(options, config.mode ?? 'free', config.defaultIndex),
  };
}

/** Multi-choice, optional group. */
export function multi(
  name: string,
  options: readonly OptionSpec[],
  config: { mode?: PriceMode; maxSelect?: number } = {},
): TemplateOptionGroup {
  return {
    name,
    selectionType: 'multi',
    isRequired: false,
    minSelect: 0,
    maxSelect: Math.min(config.maxSelect ?? options.length, options.length),
    options: toOptions(options, config.mode ?? 'free'),
  };
}

/** Size / portion group: selecting an option DEFINES the base price (sets_base). */
export function sizeGroup(name: string, options: readonly string[], defaultIndex = 0): TemplateOptionGroup {
  return single(name, options, { required: true, mode: 'sets_base', defaultIndex });
}

export const porsiyon = (
  options: readonly string[] = ['Yarım Porsiyon', '1 Porsiyon', '1,5 Porsiyon', '2 Porsiyon'],
  defaultIndex = 1,
) => sizeGroup('Porsiyon', options, defaultIndex);

export const boy = (options: readonly string[] = ['Küçük', 'Orta', 'Büyük'], defaultIndex = 1) =>
  sizeGroup('Boy', options, defaultIndex);

export const aciSeviyesi = (defaultIndex = 0) =>
  single('Acı Seviyesi', ['Acısız', 'Az Acılı', 'Orta Acılı', 'Acılı', 'Çok Acılı'], {
    required: true,
    defaultIndex,
  });

export const ekmekTercihi = (options: readonly OptionSpec[] = ['Lavaş', 'Tırnaklı Pide', 'Bazlama', 'Ekmeksiz']) =>
  single('Ekmek Tercihi', options, { required: true, defaultIndex: 0 });

export const icecekSecimi = (
  options: readonly OptionSpec[] = ['Ayran', 'Şalgam (Acılı)', 'Şalgam (Acısız)', 'Kola', 'Gazoz', 'Su'],
) => single('İçecek', options, { mode: 'surcharge' });

export const yanindaGelen = (options: readonly OptionSpec[], maxSelect?: number) =>
  multi('Yanında', options, maxSelect === undefined ? {} : { maxSelect });

export const sosSecimi = (options: readonly OptionSpec[], mode: PriceMode = 'free') =>
  multi('Sos', options, { mode });

export const pismeDerecesi = () =>
  single('Pişirme Derecesi', ['Az Pişmiş', 'Orta Az', 'Orta', 'Orta İyi', 'İyi Pişmiş'], {
    required: true,
    defaultIndex: 2,
  });

export const sekerOrani = () =>
  single('Şeker', ['Sade', 'Az Şekerli', 'Orta Şekerli', 'Şekerli'], { required: true, defaultIndex: 2 });

export const dondurmaEki = () =>
  single(
    'Dondurma',
    [
      { name: 'Dondurmasız', mode: 'free', isDefault: true },
      'Sade Dondurma',
      'Kaymaklı Dondurma',
      'Fıstıklı Dondurma',
      'Çikolatalı Dondurma',
    ],
    { mode: 'surcharge' },
  );
