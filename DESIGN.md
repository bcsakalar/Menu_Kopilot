# Design

The identity carried over from the phone app: anthracite surfaces separated by hairlines, Manrope, amber for the count,
and paprika only for the main action and the current tab. Tokens live in [`web/src/styles.css`](web/src/styles.css); nothing outside that file picks a color.

## Principles

- The rep reads this while talking. Every screen answers "what do I say next" first, details second.
- Sections are tabs, not one long page: a 30-card answer must not bury the composer.
- A new answer scrolls to its first line, never to its end.
- Options, removable and extra ingredients are visible on the card. Hiding them behind a tap was the phone app's
  most repeated complaint.
- No nested cards. A result is one surface with hairline rows.

## Color

Follows the machine's light or dark setting; light is the base because a call center is usually lit. Restrained: neutrals
plus paprika for the main action, the current tab and the "Söyle" label. Selection is neutral. Amber means "still short of the
target", green means "reached". Nothing else is colored.

## Type

Manrope Variable from the bundle, no font is fetched at runtime. Tabular figures everywhere. Fixed scale: 12.5 / 13 / 14 /
15 / 16 / 17 px in the product, 24 for admin page titles, 32 for the one welcome line. Weights: 500 body, 700 labels, 800
names and numbers.

## Components

- **CountMeter:** `15 / 20 ürün` over one segment per product, up to 24; a continuous bar above that.
- **Card row:** name and meta, copy; the sentence to say; then a spec list with one aligned line per field (Açıklama, Opsiyon,
  Çıkarılabilir, Ekstra), each copied on its own.
- **Next steps:** the chips stay above the composer, so they are in reach whatever the scroll position.
- **Composer:** the page's only input. Paste works from anywhere; dropped or pasted images appear as thumbnails with a short
  drop-in, the one authored motion.
- **Admin:** the same tokens. Overview is a stat strip and two panels; a conversation reads as a timeline with each analysis
  folded under its own line.

## Motion

150–250 ms on state changes only. The skeleton shimmer and the status dot are the only loops. `prefers-reduced-motion` turns
all of it off.
