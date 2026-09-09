"use client";

import { ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  canonicalMemberPhone,
  duplicateSummary,
  findDuplicateClusters,
  findMultiAssociationPeople,
  findSameSpaceNameClusters,
  type DuplicateCluster,
  type DuplicateMember,
} from "../../lib/member-duplicates";

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
  const nameClusters = useMemo(() => findSameSpaceNameClusters(members), [members]);
  const multi = useMemo(() => findMultiAssociationPeople(members), [members]);
  const summary = useMemo(() => duplicateSummary(clusters), [clusters]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keeperId, setKeeperId] = useState("");
  const [otherId, setOtherId] = useState("");

  const people = useMemo(() => {
    const seen = new Map<string, DuplicateMember>();
    for (const member of members) {
      const phone = canonicalMemberPhone(member.phone);
      const key = phone.length >= 7 ? `p:${phone}` : `id:${member.id}`;
      if (!seen.has(key)) seen.set(key, member);
    }
    return [...seen.values()].sort((a, b) => a.display_name.localeCompare(b.display_name, "ar"));
  }, [members]);

  const spaceName = (id: string) => {
    const space = spaces.find((item) => item.id === id);
    return locale === "ar" ? (space?.name_ar || id) : (space?.name_en || id);
  };

  const merge = async (cluster?: DuplicateCluster, force = false) => {
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
            force,
          }
          : { action: "mergeMemberDuplicates", idempotencyKey: crypto.randomUUID(), mergeAll: true }),
      });
      const result = await response.json() as { error?: string; mergedCount?: number; clusterCount?: number };
      if (!response.ok) throw new Error(result.error ?? "MERGE_FAILED");
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
          MEMBER_PHONE_TAKEN: "هذا الرقم مستخدم داخل الجمعية الأخرى. ادمج السجلين داخل تلك الجمعية أولاً.",
        }
        : {
          MERGE_CONFLICT_ACCOUNTS: "Cannot merge: two different signed-in accounts share this number.",
          OWNER_MEMBER_LOCKED: "The owner membership cannot be removed.",
          NOTHING_TO_MERGE: "No duplicate phone numbers were found in the same association.",
          NOT_DUPLICATES: "These records are not the same phone number.",
          MERGE_CROSS_SPACE: "Merge stays inside one association so other wallets are unchanged.",
          MEMBER_PHONE_TAKEN: "That number is already used in the other association. Merge there first.",
        };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };

  const unify = async () => {
    if (!keeperId || !otherId || keeperId === otherId) {
      setError(locale === "ar" ? "اختر شخصين مختلفين." : "Pick two different people.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "unifyMemberPerson",
          idempotencyKey: crypto.randomUUID(),
          keeperMemberId: keeperId,
          otherMemberId: otherId,
        }),
      });
      const result = await response.json() as { error?: string; mode?: string };
      if (!response.ok) throw new Error(result.error ?? "MERGE_FAILED");
      setOpen(false);
      onMerged(locale === "ar"
        ? (result.mode === "linked"
          ? "تم توحيد الرقم ليظهرا كشخص واحد في القائمة. عضوية كل جمعية بقيت كما هي."
          : "تم دمج السجلين داخل الجمعية نفسها.")
        : (result.mode === "linked"
          ? "Phone numbers were unified so they appear as one person. Each association membership is unchanged."
          : "The two records in the same association were merged."));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "MERGE_FAILED";
      const messages: Record<string, string> = locale === "ar"
        ? {
          MEMBER_PHONE_TAKEN: "لا يمكن توحيد الرقم: هذا الهاتف مستخدم لعضو آخر في نفس الجمعية.",
          MERGE_CONFLICT_ACCOUNTS: "لا يمكن الدمج: حسابان مرتبطان بتسجيل دخول مختلف.",
          OWNER_MEMBER_LOCKED: "لا يمكن حذف عضوية المالك.",
          INVALID_PHONE: "السجل الأساس يحتاج رقم هاتف لتوحيد الهوية.",
        }
        : {
          MEMBER_PHONE_TAKEN: "Cannot unify: that phone already belongs to another member in the same association.",
          MERGE_CONFLICT_ACCOUNTS: "Cannot merge: two different signed-in accounts share this number.",
          OWNER_MEMBER_LOCKED: "The owner membership cannot be removed.",
          INVALID_PHONE: "The keeper record needs a phone number to unify identity.",
        };
      setError(messages[code] ?? code);
    } finally {
      setSaving(false);
    }
  };

  const renderCluster = (cluster: DuplicateCluster, force: boolean) => {
    const keeper = cluster.members.find((item) => item.id === cluster.keeperId) ?? cluster.members[0];
    return (
      <article key={cluster.key} className={`duplicate-cluster${cluster.blockedReason ? " is-blocked" : ""}`}>
        <header>
          <strong>{spaceName(cluster.spaceId)}</strong>
          <span>{locale === "ar" ? `${cluster.members.length} سجلات` : `${cluster.members.length} records`}</span>
        </header>
        <p>{cluster.members.map((item) => item.display_name).join(" · ")}</p>
        <small>{cluster.members.map((item) => item.phone || "—").join(" · ")}</small>
        {cluster.blockedReason ? (
          <em>{locale === "ar" ? "محظور: حسابان مرتبطان بتسجيل دخول مختلف" : "Blocked: two different signed-in accounts"}</em>
        ) : (
          <button type="button" className="secondary-button" disabled={saving} onClick={() => void merge(cluster, force)}>
            {locale === "ar" ? `دمج في «${keeper.display_name}»` : `Merge into “${keeper.display_name}”`}
          </button>
        )}
      </article>
    );
  };

  return (
    <>
      <button
        type="button"
        className={`secondary-button duplicate-merge-trigger${summary.extraAccounts || nameClusters.length ? " has-duplicates" : ""}`}
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
                  ? "عمود «الجمعيات» في الجدول يعني عدد الجمعيات التي ينتمي إليها الشخص، وليس عدد الحسابات المكررة. عبد الحميد في جمعيتين يبقى عضوين مستقلين."
                  : "The Associations column is how many groups the person belongs to, not duplicate accounts. The same person in two associations is kept as two memberships."}
              </p>
              {multi.length ? (
                <div className="duplicate-cluster-list">
                  {multi.map((item) => (
                    <article key={item.phone} className="duplicate-cluster">
                      <header>
                        <strong>{item.members[0]?.display_name}</strong>
                        <span>{locale === "ar" ? `${item.associationCount} جمعيات` : `${item.associationCount} associations`}</span>
                      </header>
                      <p>{item.phone}</p>
                      <small>{locale === "ar" ? "ليست تكراراً للدمج — عضوية صحيحة في أكثر من جمعية." : "Not a merge duplicate — a valid membership in more than one association."}</small>
                    </article>
                  ))}
                </div>
              ) : null}
              {clusters.length ? (
                <>
                  <p className="modal-note">{locale === "ar" ? "تكرار نفس الرقم داخل الجمعية:" : "Same phone inside one association:"}</p>
                  <div className="duplicate-cluster-list">{clusters.map((cluster) => renderCluster(cluster, false))}</div>
                </>
              ) : (
                <p className="modal-note">{locale === "ar" ? "لا يوجد سجلان بنفس رقم الهاتف داخل جمعية واحدة." : "No two records share a phone number inside the same association."}</p>
              )}
              {nameClusters.length ? (
                <>
                  <p className="modal-note">{locale === "ar" ? "نفس الاسم داخل الجمعية مع أرقام مختلفة:" : "Same name inside one association with different numbers:"}</p>
                  <div className="duplicate-cluster-list">{nameClusters.map((cluster) => renderCluster(cluster, true))}</div>
                </>
              ) : null}
              <p className="modal-note">
                {locale === "ar"
                  ? "إن كان «عبد الحميد» و«ABDUL HAMID» نفس الشخص برقمين مختلفين: اختر السجل الذي يبقى رقمه، ثم السجل الثاني لتوحيده."
                  : "If two rows are the same person with different numbers, pick the keeper phone first, then the other record to unify."}
              </p>
              <div className="form-row">
                <label>
                  <span>{locale === "ar" ? "يبقى هذا الشخص / رقمه" : "Keep this person / number"}</span>
                  <select value={keeperId} onChange={(event) => setKeeperId(event.target.value)}>
                    <option value="">{locale === "ar" ? "اختر…" : "Choose…"}</option>
                    {people.map((item) => (
                      <option key={`k-${item.id}`} value={item.id}>{item.display_name} · {item.phone || "—"}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{locale === "ar" ? "يُوحَّد مع" : "Unify with"}</span>
                  <select value={otherId} onChange={(event) => setOtherId(event.target.value)}>
                    <option value="">{locale === "ar" ? "اختر…" : "Choose…"}</option>
                    {people.filter((item) => item.id !== keeperId).map((item) => (
                      <option key={`o-${item.id}`} value={item.id}>{item.display_name} · {item.phone || "—"}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="secondary-button" disabled={saving || !keeperId || !otherId} onClick={() => void unify()}>
                {locale === "ar" ? "توحيد كشخص واحد" : "Unify as one person"}
              </button>
              {error ? <p className="modal-error">{error}</p> : null}
              <p className="modal-note duplicate-safety">
                <ShieldCheck size={14} />
                {locale === "ar"
                  ? "عند الدمج داخل الجمعية: المدفوع يُجمع ولا يُضاعف الاشتراك. عند التوحيد بين جمعيتين: يُنسخ الرقم فقط وتبقى العضويتان."
                  : "Same-association merge combines paid amounts without doubling dues. Cross-association unify copies the phone only and keeps both memberships."}
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
