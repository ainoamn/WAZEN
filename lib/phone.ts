/** Normalize Gulf mobile numbers for WhatsApp (default Oman +968). */

export function digitsOnly(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

export function toWhatsAppNumber(phone: string, defaultCountry = "968") {
  let digits = digitsOnly(phone);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith(defaultCountry)) return digits;
  if (digits.startsWith("0") && digits.length >= 8) return `${defaultCountry}${digits.slice(1)}`;
  if (digits.length === 8) return `${defaultCountry}${digits}`;
  return digits;
}

export function isLikelyPhone(phone: string) {
  const digits = digitsOnly(phone);
  return digits.length >= 8 && digits.length <= 15;
}
