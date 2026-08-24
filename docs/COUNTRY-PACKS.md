# Country Packs and International Expansion

Country packs live in `lib/country-packs.ts`. A pack defines ISO country/currency, default locale, IANA timezone, supported languages and tax in basis points. Money parsing uses the ISO currency scale (for example SAR/AED two decimals and OMR three) and stores integer minor units.

Current foundations: Saudi Arabia (SAR, 15%), United Arab Emirates (AED, 5%), Oman (OMR, 5%), Bahrain (BHD, 10%), Kuwait (KWD, 0% placeholder), and Qatar (QAR, 0% placeholder). These are technical defaults, not tax advice. Before activating a country commercially, validate tax rules, invoice wording/numbering, data residency, consumer law, supported payment methods, address/phone formats and Arabic/English legal copy with local specialists.

Adding a pack requires unit tests for currency precision and tax rounding, translated UI/legal content, timezone-bound billing tests, a migration/backfill plan and product/legal approval.
