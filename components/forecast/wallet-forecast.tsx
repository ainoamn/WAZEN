"use client";

import { TrendingUp } from "lucide-react";
import { CollapsiblePanel } from "../ui/collapsible-panel";
import { formatMoneyMinor } from "../../lib/money";
import { projectCashflow } from "../../lib/wallet-forecast";

type Locale = "ar" | "en";

export function WalletForecastPanel({
  locale,
  currency,
  spaceType,
  balanceMinor,
  monthlyInflowMinor,
  monthlyOutflowMinor,
  remainingInflowMinor,
  remainingOutflowMinor,
  title,
  foldId = "wallet-forecast",
}: {
  locale: Locale;
  currency: string;
  spaceType?: string;
  balanceMinor: number;
  monthlyInflowMinor: number;
  monthlyOutflowMinor: number;
  remainingInflowMinor?: number;
  remainingOutflowMinor?: number;
  title?: string;
  foldId?: string;
}) {
  const forecast = projectCashflow({ balanceMinor, monthlyInflowMinor, monthlyOutflowMinor, months: 3 });
  const money = (minor: number) => formatMoneyMinor(minor, currency, locale);
  const remainingIn = remainingInflowMinor ?? monthlyInflowMinor;
  const remainingOut = remainingOutflowMinor ?? monthlyOutflowMinor;
  const remainingNet = remainingIn - remainingOut;
  const tripNote = remainingOut > 0
    ? (locale === "ar"
      ? `رحلة لمرة واحدة: لا راتب شهري. المتبقي بين الأعضاء ${money(remainingOut)} حتى تُصفّى التسويات. نقد الصندوق ${money(balanceMinor)}.`
      : `One-off trip: no monthly salary. ${money(remainingOut)} still open between members until settled. Fund cash ${money(balanceMinor)}.`)
    : (locale === "ar"
      ? `رحلة لمرة واحدة: لا دخل شهري ولا خصم متكرر. نقد الصندوق ${money(balanceMinor)}. التسويات بين الأعضاء مسوّاة.`
      : `One-off trip: no recurring inflow or outflow. Fund cash ${money(balanceMinor)}. Peer settlements are settled.`);
  return (
    <CollapsiblePanel
      id={foldId}
      heading={<><span className="section-kicker"><TrendingUp size={15} />{locale === "ar" ? "تنبؤ 3 أشهر" : "3-month forecast"}</span><h2>{title ?? (spaceType === "trip" ? (locale === "ar" ? "صندوق الرحلة والتسويات" : "Trip fund and settlements") : (locale === "ar" ? "الدخل المتوقع مقابل الخصم المتوقع" : "Expected inflows versus outflows"))}</h2></>}
      foldLabel={locale === "ar" ? "طي التنبؤ" : "Fold forecast"}
    >
      <p className="modal-note">
        {spaceType === "trip"
          ? tripNote
          : locale === "ar"
          ? `المتبقي هذا الشهر (غير المرحّل): دخل ${money(remainingIn)} · خصم ${money(remainingOut)} · صافي ${money(remainingNet)}. الأشهر التالية تفترض الدخل والخصم غير الملغيين: ${money(monthlyInflowMinor)} − ${money(monthlyOutflowMinor)}.`
          : `Still open this month: in ${money(remainingIn)} · out ${money(remainingOut)} · net ${money(remainingNet)}. Later months use uncancelled schedule ${money(monthlyInflowMinor)} − ${money(monthlyOutflowMinor)}.`}
      </p>
      <div className="personal-account-grid">
        {forecast.rows.map((row) => (
          <div className={`personal-account-card ${row.projectedMinor < 0 ? "family-alert" : ""}`} key={row.month}>
            <div>
              <small>{locale === "ar" ? `بعد ${row.month} شهر` : `In ${row.month} month${row.month > 1 ? "s" : ""}`}</small>
              <strong className={row.projectedMinor < 0 ? "amount-negative" : ""}>{money(row.projectedMinor)}</strong>
            </div>
            <b>{row.shortfallMinor > 0 ? (locale === "ar" ? `عجز ${money(row.shortfallMinor)}` : `Gap ${money(row.shortfallMinor)}`) : (locale === "ar" ? "مستقر" : "Stable")}</b>
          </div>
        ))}
      </div>
      {forecast.needsBoost && (
        <p className="modal-note amount-negative">
          {locale === "ar"
            ? `تنبيه: الصندوق سيحتاج تعزيزاً بنحو ${money(forecast.shortfallMinor)} خلال ثلاثة أشهر إن استمر الدخل والخصم على هذا المعدل.`
            : `Alert: the fund may need a boost of about ${money(forecast.shortfallMinor)} within three months at this run-rate.`}
        </p>
      )}
    </CollapsiblePanel>
  );
}
