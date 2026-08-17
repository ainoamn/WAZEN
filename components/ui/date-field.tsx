"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCommerceLocale } from "../../app/commercial-kit";

const WEEKDAYS_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function toIsoMonth(year: number, monthIndex: number) {
  return `${year}-${pad(monthIndex + 1)}`;
}

function parseDateInput(raw: string, mode: "date" | "month"): string | null {
  const text = raw.trim().replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  if (!text) return "";
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return mode === "month" ? toIsoMonth(year, month - 1) : toIsoDate(year, month - 1, day);
  }
  const isoMonth = text.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const month = Number(isoMonth[2]);
    if (month < 1 || month > 12) return null;
    return mode === "month" ? toIsoMonth(year, month - 1) : toIsoDate(year, month - 1, 1);
  }
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return mode === "month" ? toIsoMonth(year, month - 1) : toIsoDate(year, month - 1, day);
  }
  const my = text.match(/^(\d{1,2})[./-](\d{4})$/);
  if (my && mode === "month") {
    const month = Number(my[1]);
    const year = Number(my[2]);
    if (month < 1 || month > 12) return null;
    return toIsoMonth(year, month - 1);
  }
  return null;
}

export function DateField({
  value,
  onChange,
  required = false,
  mode = "date",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  mode?: "date" | "month";
  placeholder?: string;
}) {
  const { locale, l } = useCommerceLocale();
  const weekdays = locale === "ar" ? WEEKDAYS_AR : WEEKDAYS_EN;
  const months = locale === "ar" ? MONTHS_AR : MONTHS_EN;
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const parsed = parseDateInput(value, mode);
  const selected = parsed || value;
  const selectedDate = selected ? new Date(`${mode === "month" ? `${selected}-01` : selected}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState({ year: selectedDate.getFullYear(), month: selectedDate.getMonth() });

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const start = first.getDay();
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const items: Array<{ day: number; iso: string } | null> = [];
    for (let index = 0; index < start; index += 1) items.push(null);
    for (let day = 1; day <= days; day += 1) items.push({ day, iso: toIsoDate(cursor.year, cursor.month, day) });
    return items;
  }, [cursor.year, cursor.month]);

  const commitDraft = () => {
    const next = parseDateInput(draft, mode);
    if (next === "") {
      if (!required) onChange("");
      else setDraft(value);
      return;
    }
    if (!next) {
      setDraft(value);
      return;
    }
    onChange(next);
    setDraft(next);
  };

  const pick = (iso: string) => {
    const next = mode === "month" ? iso.slice(0, 7) : iso;
    onChange(next);
    setDraft(next);
    setOpen(false);
  };

  const today = new Date();
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="date-field" ref={root} dir="ltr">
      <input
        className="date-field-input"
        required={required}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? (mode === "month" ? l("سنة-شهر", "YYYY-MM") : l("سنة-شهر-يوم", "YYYY-MM-DD"))}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onFocus={() => setCursor({ year: selectedDate.getFullYear(), month: selectedDate.getMonth() })}
      />
      <button type="button" className="date-field-toggle" aria-label={l("فتح التقويم", "Open calendar")} onClick={() => setOpen((current) => !current)}>
        <CalendarDays size={16} />
      </button>
      {open && (
        <div className="date-calendar" role="dialog" aria-label={l("التقويم", "Calendar")}>
          <div className="date-calendar-head">
            <button type="button" onClick={() => setCursor((current) => current.month === 0 ? { year: current.year - 1, month: 11 } : { year: current.year, month: current.month - 1 })} aria-label={l("الشهر السابق", "Previous month")}><ChevronLeft size={16} /></button>
            <strong>{months[cursor.month]} {cursor.year}</strong>
            <button type="button" onClick={() => setCursor((current) => current.month === 11 ? { year: current.year + 1, month: 0 } : { year: current.year, month: current.month + 1 })} aria-label={l("الشهر التالي", "Next month")}><ChevronRight size={16} /></button>
          </div>
          {mode === "date" && (
            <>
              <div className="date-calendar-week">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="date-calendar-grid">
                {cells.map((cell, index) => cell ? (
                  <button
                    type="button"
                    key={cell.iso}
                    className={`${cell.iso === selected ? "selected" : ""} ${cell.iso === todayIso ? "today" : ""}`}
                    onClick={() => pick(cell.iso)}
                  >
                    {cell.day}
                  </button>
                ) : <span key={`empty-${index}`} />)}
              </div>
            </>
          )}
          {mode === "month" && (
            <div className="date-calendar-months">
              {months.map((label, month) => {
                const iso = toIsoMonth(cursor.year, month);
                return (
                  <button type="button" key={iso} className={iso === selected ? "selected" : ""} onClick={() => pick(iso)}>
                    {locale === "ar" ? label : label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          )}
          <div className="date-calendar-foot">
            <button type="button" onClick={() => pick(mode === "month" ? todayIso.slice(0, 7) : todayIso)}>{l("اليوم", "Today")}</button>
            {!required && <button type="button" onClick={() => { onChange(""); setDraft(""); setOpen(false); }}>{l("مسح", "Clear")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
