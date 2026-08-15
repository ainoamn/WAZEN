export type LinkedHolding = {
  spaceId: string;
  accountId: string | null;
  balanceMinor: number;
  name?: string;
};

export function bankCustodySplit(ownMinor: number, holdings: LinkedHolding[]) {
  const heldMinor = holdings.reduce((sum, row) => sum + Math.max(0, Number(row.balanceMinor) || 0), 0);
  const own = Number(ownMinor) || 0;
  return {
    ownMinor: own,
    heldMinor,
    totalMinor: own + heldMinor,
    mixed: heldMinor > 0,
  };
}

export function holdingsForAccount(accountId: string, holdings: LinkedHolding[]) {
  return holdings.filter((row) => row.accountId === accountId);
}
