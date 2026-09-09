"use client";

import { ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/client-api";
import { duplicateSummary, findDuplicateClusters, type DuplicateCluster, type DuplicateMember } from "../../lib/member-duplicates";

type Locale = "ar" | "en";
type SpaceLite = { id: string; name_ar: string; name_en: string };

export function DuplicateMergePanel({
  members,
  spaces,
  locale,
  onMerged,
}: {
  members: DuplicateMember[];
  spaces: SpaceLite[];
  locale: Locale;
  onMerged: (message: string) => void;
}) {
  const clusters = useMemo(() => findDuplicateClusters(members), [members]);
  const summary = useMemo(() => duplicateSummary(clusters), [clusters]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const spaceName = (id: string) => {
    const space = spaces.find((item) => item.id === id);
    return locale === "ar" ? (space?.name_ar || id) : (space?.name_en || id);
  };

  const merge = async (cluster?: DuplicateCluster) => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cluster
          ? {
            action: "mergeMemberDuplicates",
            idempotencyKey: crypto.randomUUID(),
            spaceId: cluster.spaceId,
            keeperId: cluster.keeperId,
            duplicateIds: cluster.members.map((item) => item.id).filter((id) => id !== cluster.keeperId),
          }
          : { action: "mergeMemberDuplicates", idempotencyKey: crypto.randomUUID(), mergeAll: true }),
      });
      const result = await response.json() as { error?: string; mergedCount?: number; clusterCount?: number };
      if (!response.ok) {
        throw new Error(result.error ?? "MERGE_FAILED");
      }
      setOpen(false);
      onMerged(locale === "ar"
        ? `تم دمج ${result.mergedCount ?? 0} حساباً مكرراً في ${result.clusterCount ?? 1} مجموعة. الحسابات الأخرى لم تُمس.`
        : `Merged ${result.mergedCount ?? 0} duplicate account(s) in ${result.clusterCount ?? 1} group(s). Other accounts were not changed.`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "MERGE_FAILED";
      const messages: Record<string, string> = locale === "ar"
        ? {
          MERGE_CONFLICT_ACCOUNTS: "لا يمكن الدمج: حسابان مرتبطان بتسجيل دخول مختلف.",
          OWNER_MEMBER_LOCKED: "لا يمكن حذف عضوية المالك.",
          NOTHING_TO_MERGE: "لا توجد أرقام هاتف مكررة داخل الجمعية نفسها.",
          NOT_DUPLICATES: "هذه السجلات ليست تكراراً لنفس رقم الهاتف.",
          MERGE_CROSS_SPACE: "الدمج داخل الجمعية الواحدة فقط حتى لا تتأثر الجمعيات الأخرى.",
        }
        : {
          MERGE_CONFLICT_ACCOUNTS: "Cannot merge: two different signed-in accounts share this number.",
          OWNER_MEMBER_LOCKED: "The owner membership cannot be removed.",
          NOTHING_TO_MERGE: "No duplicate phone numbers were found in the same association.",
          NOT_DUPLICATES: "These records are not the same phone number.",
          MERGE_CROSS_SPACE: "Merge stays inside one association so other wallets are unchanged.",
        };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`secondary-button duplicate-merge-trigger${summary.extraAccounts ? " has-duplicates" : ""}`}
        onClick={() => { setError(""); setOpen(true); }}
      >
        <Users size={16} />
        {locale === "ar"
          ? (summary.extraAccounts ? `دمج المكرر (${summary.extraAccounts})` : "دمج المكرر")
          : (summary.extraAccounts ? `Merge duplicates (${summary.extraAccounts})` : "Merge duplicates")}
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
          <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "دمج الأرقام المكررة" : "Merge duplicate numbers"}>
            <div className="modal-header">
              <h2>{locale === "ar" ? "دمج الأرقام المكررة" : "Merge duplicate phone numbers"}</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} aria-label="Close">×</button>
            </div>
            <div className="modal-form">
              <p className="modal-note">
                {locale === "ar"
                  ? "يُدمج فقط من يشتركون في نفس رقم الهاتف داخل الجمعية الواحدة. تكرار البريد مسموح. نفس الشخص في جمعيتين مختلفتين ليس تكراراً."
                  : "Only matching phone numbers inside the same association are merged. Repeated emails are allowed. The same person in two associations is not a duplicate."}
              </p>
              {summary.clusterCount ? (
                <>
                  <p className="modal-note">
                    {locale === "ar"
                      ? `${summary.clusterCount} مجموعة تكرار · ${summary.extraAccounts} حساب إضافي.`
                      : `${summary.clusterCount} duplicate group(s) · ${summary.extraAccounts} extra account(s).`}
                  </p>
                  <div className="duplicate-cluster-list">
                    {clusters.map((cluster) => {
                      const keeper = cluster.members.find((item) => item.id === cluster.keeperId) ?? cluster.members[0];
                      return (
                        <article key={cluster.key} className={`duplicate-cluster${cluster.blockedReason ? " is-blocked" : ""}`}>
                          <header>
                            <strong>{spaceName(cluster.spaceId)}</strong>
                            <span>{locale === "ar" ? `${cluster.members.length} سجلات` : `${cluster.members.length} records`}</span>
                          </header>
                          <p>{cluster.members.map((item) => item.display_name).join(" · ")}</p>
                          <small>{keeper.phone || "—"}</small>
                          {cluster.blockedReason ? (
                            <em>{locale === "ar" ? "محظور: حسابان مرتبطان بتسجيل دخول مختلف" : "Blocked: two different signed-in accounts"}</em>
                          ) : (
                            <button type="button" className="secondary-button" disabled={saving} onClick={() => void merge(cluster)}>
                              {locale === "ar" ? `دمج في «${keeper.display_name}»` : `Merge into “${keeper.display_name}”`}
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="modal-note">
                  {locale === "ar"
                    ? "لا توجد أرقام هاتف مكررة داخل أي جمعية حالياً."
                    : "No duplicate phone numbers were found in any association."}
                </p>
              )}
              {error ? <p className="modal-error">{error}</p> : null}
              <p className="modal-note duplicate-safety">
                <ShieldCheck size={14} />
                {locale === "ar"
                  ? "المدفوع يُجمع، والاشتراك المستحق لا يُضاعف. حصص المصروف الخاصة بالمكرر تُنقل إليه فقط."
                  : "Paid amounts are combined; the dues plan is not doubled. Only this person’s expense shares move."}
              </p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={saving} onClick={() => setOpen(false)}>{locale === "ar" ? "إغلاق" : "Close"}</button>
                <button type="button" className="primary-button" disabled={saving || summary.mergeableClusters === 0} onClick={() => void merge()}>
                  {saving ? "…" : (locale === "ar" ? `دمج الآمن (${summary.mergeableExtras})` : `Merge safe (${summary.mergeableExtras})`)}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
