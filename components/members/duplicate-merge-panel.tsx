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
  if (!summary.clusterCount) return null;

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
          NOTHING_TO_MERGE: "لا توجد حسابات مكررة قابلة للدمج.",
          NOT_DUPLICATES: "هذه السجلات ليست تكراراً مؤكداً لنفس الشخص.",
          MERGE_CROSS_SPACE: "الدمج داخل الجمعية الواحدة فقط حتى لا تتأثر الجمعيات الأخرى.",
        }
        : {
          MERGE_CONFLICT_ACCOUNTS: "Cannot merge: two different signed-in accounts share this number.",
          OWNER_MEMBER_LOCKED: "The owner membership cannot be removed.",
          NOTHING_TO_MERGE: "No mergeable duplicates found.",
          NOT_DUPLICATES: "These records are not confirmed duplicates.",
          MERGE_CROSS_SPACE: "Merge stays inside one association so other wallets are unchanged.",
        };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="secondary-button duplicate-merge-trigger" onClick={() => setOpen(true)}>
        <Users size={16} />
        {locale === "ar" ? `دمج المكرر (${summary.extraAccounts})` : `Merge duplicates (${summary.extraAccounts})`}
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
          <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-label={locale === "ar" ? "دمج الحسابات المكررة" : "Merge duplicate accounts"}>
            <div className="modal-header">
              <h2>{locale === "ar" ? "دمج الأرقام والحسابات المكررة" : "Merge duplicate numbers and accounts"}</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} aria-label="Close">×</button>
            </div>
            <div className="modal-form">
              <p className="modal-note">
                {locale === "ar"
                  ? `${summary.clusterCount} مجموعة تكرار · ${summary.extraAccounts} حساب إضافي. الدمج يتم داخل الجمعية نفسها فقط، ولا يغيّر أرصدة الأعضاء الآخرين.`
                  : `${summary.clusterCount} duplicate group(s) · ${summary.extraAccounts} extra account(s). Merge stays inside the same association and does not change other members’ balances.`}
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
                      <small>{keeper.phone || keeper.email || "—"}</small>
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
