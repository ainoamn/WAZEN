export function projectCashflow(input: {
  balanceMinor: number;
  monthlyInflowMinor: number;
  monthlyOutflowMinor: number;
  months?: number;
}) {
  const months = input.months ?? 3;
  const netMonthly = Number(input.monthlyInflowMinor) - Number(input.monthlyOutflowMinor);
  const rows: Array<{ month: number; projectedMinor: number; shortfallMinor: number }> = [];
  let cash = Number(input.balanceMinor);
  for (let month = 1; month <= months; month += 1) {
    cash += netMonthly;
    rows.push({
      month,
      projectedMinor: cash,
      shortfallMinor: Math.max(0, -cash),
    });
  }
  const endProjectedMinor = rows[rows.length - 1]?.projectedMinor ?? Number(input.balanceMinor);
  return {
    months,
    netMonthlyMinor: netMonthly,
    rows,
    endProjectedMinor,
    needsBoost: endProjectedMinor < 0,
    shortfallMinor: Math.max(0, -endProjectedMinor),
  };
}
