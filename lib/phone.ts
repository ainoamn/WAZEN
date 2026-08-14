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
  if (digits.startsWith("0") && digits.length >= 7) return `${defaultCountry}${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 8) return `${defaultCountry}${digits}`;
  return digits;
}

export function isLikelyPhone(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length < 7 || digits.length > 15) return false;
  if (digits.startsWith("968")) return digits.length >= 10 && digits.length <= 15;
  return true;
}
