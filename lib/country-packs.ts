export type CountryPack = { country: string; currency: string; locale: "ar" | "en"; timezone: string; taxBasisPoints: number; supportedLocales: readonly ("ar" | "en")[] };

export const countryPacks: Readonly<Record<string, CountryPack>> = Object.freeze({
  SA: { country: "SA", currency: "SAR", locale: "ar", timezone: "Asia/Riyadh", taxBasisPoints: 1500, supportedLocales: ["ar", "en"] },
  AE: { country: "AE", currency: "AED", locale: "ar", timezone: "Asia/Dubai", taxBasisPoints: 500, supportedLocales: ["ar", "en"] },
  OM: { country: "OM", currency: "OMR", locale: "ar", timezone: "Asia/Muscat", taxBasisPoints: 500, supportedLocales: ["ar", "en"] },
  BH: { country: "BH", currency: "BHD", locale: "ar", timezone: "Asia/Bahrain", taxBasisPoints: 1000, supportedLocales: ["ar", "en"] },
  KW: { country: "KW", currency: "KWD", locale: "ar", timezone: "Asia/Kuwait", taxBasisPoints: 0, supportedLocales: ["ar", "en"] },
  QA: { country: "QA", currency: "QAR", locale: "ar", timezone: "Asia/Qatar", taxBasisPoints: 0, supportedLocales: ["ar", "en"] },
});

export function countryPack(country: string) { return countryPacks[country.toUpperCase()] ?? countryPacks.OM; }

export function listCountryPacks() {
  return Object.values(countryPacks);
}

