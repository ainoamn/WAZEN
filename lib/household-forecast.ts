export function monthCountUntil(targetIso: string, asOf = new Date()) {
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return 0;
  const months = (target.getUTCFullYear() - asOf.getUTCFullYear()) * 12 + (target.getUTCMonth() - asOf.getUTCMonth()) + 1;
  return Math.max(0, months);
}

export function forecastFamilyEvent(input: {
  balanceMinor: number;
  expectedCostMinor: number;
  monthlyInflowMinor: number;
  monthsUntil: number;
  unpaidDuesMinor: number;
}) {
  const scheduledInflow = Math.min(Math.max(0, input.unpaidDuesMinor), Math.max(0, input.monthlyInflowMinor) * Math.max(0, input.monthsUntil));
  const projectedMinor = input.balanceMinor + scheduledInflow;
  const shortfallMinor = Math.max(0, input.expectedCostMinor - projectedMinor);
  return {
    monthsUntil: input.monthsUntil,
    scheduledInflowMinor: scheduledInflow,
    projectedMinor,
    shortfallMinor,
    needsBoost: shortfallMinor > 0,
  };
}
