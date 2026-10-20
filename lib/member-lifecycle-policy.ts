/** Pure removal policy — no DB imports (safe for unit tests). */

export function resolveMemberRemovalDecision(input: {
  prefer: "archive" | "remove" | "auto";
  linkedToAccount: boolean;
  hasHistory: boolean;
}): { mode: "archive" | "remove" } | { error: "MEMBER_LINKED_ACCOUNT" | "MEMBER_HAS_HISTORY" } {
  if (input.prefer === "remove" && input.linkedToAccount) {
    return { error: "MEMBER_LINKED_ACCOUNT" };
  }
  if (input.prefer === "remove" && input.hasHistory) {
    return { error: "MEMBER_HAS_HISTORY" };
  }
  if (
    input.prefer === "archive"
    || input.linkedToAccount
    || (input.prefer === "auto" && input.hasHistory)
  ) {
    return { mode: "archive" };
  }
  return { mode: "remove" };
}
