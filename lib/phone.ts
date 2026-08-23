/** Normalize mobile numbers for WhatsApp (default Oman +968). */

import { DEFAULT_DIAL_CODE, DEFAULT_DIAL_ISO2, findCountryByDial, matchDialPrefix } from "./country-dial-codes.ts";

export function digitsOnly(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

export function toWhatsAppNumber(phone: string, defaultCountry = DEFAULT_DIAL_CODE) {
  let digits = digitsOnly(phone);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith(defaultCountry)) return digits;
  if (digits.startsWith("0") && digits.length >= 7) return `${defaultCountry}${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 8) return `${defaultCountry}${digits}`;
  return digits;
}

/** Join dial code + national number into WhatsApp digits (no +). */
export function composeWhatsAppPhone(dialCode: string, national: string) {
  const dial = digitsOnly(dialCode) || DEFAULT_DIAL_CODE;
  let local = digitsOnly(national);
  if (!local) return "";
  if (local.startsWith("00")) local = local.slice(2);
  if (local.startsWith(dial)) return toWhatsAppNumber(local, dial);
  if (local.startsWith("0")) local = local.replace(/^0+/, "");
  return toWhatsAppNumber(`${dial}${local}`, dial);
}

export function splitPhoneParts(phone: string, fallbackDial = DEFAULT_DIAL_CODE) {
  const digits = digitsOnly(phone);
  if (!digits) {
    return { dial: fallbackDial, iso2: DEFAULT_DIAL_ISO2, national: "" };
  }
  const dial = matchDialPrefix(digits.startsWith("00") ? digits.slice(2) : digits);
  const body = (digits.startsWith("00") ? digits.slice(2) : digits);
  const national = body.startsWith(dial) ? body.slice(dial.length) : body;
  const country = findCountryByDial(dial);
  return { dial: country.dial, iso2: country.iso2, national };
}

export function isLikelyPhone(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length < 7 || digits.length > 15) return false;
  if (digits.startsWith(DEFAULT_DIAL_CODE)) return digits.length >= 10 && digits.length <= 15;
  return true;
}
