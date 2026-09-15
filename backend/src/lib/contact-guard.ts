/**
 * Removes e-mail addresses and phone numbers from free text coming from the web (restaurant research): the tool
 * collects menu information only, never personal contact details.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// +90 5xx xxx xx xx · 0 (212) xxx xx xx · 212 xxx xx xx · 444 xx xx
const PHONE = /(?:\+?90[\s.-]?)?(?:\(?0?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b|\b444[\s.-]?\d{2}[\s.-]?\d{2}\b/gu;

export function stripContactDetails(text: string): string {
  return text
    .replace(EMAIL, '')
    .replace(PHONE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function containsContactDetails(text: string): boolean {
  EMAIL.lastIndex = 0;
  PHONE.lastIndex = 0;
  return EMAIL.test(text) || PHONE.test(text);
}
