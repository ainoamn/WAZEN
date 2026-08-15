"use client";

import { ChevronDown } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

const STORAGE_KEY = "wazen-fold";

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

export function useFold(id: string, defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const stored = readMap()[id];
    if (typeof stored === "boolean") setOpen(stored);
  }, [id]);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        const map = readMap();
        map[id] = next;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch { /* ignore quota */ }
      return next;
    });
  };
  return [open, toggle] as const;
}

export function FoldWrap({
  id,
  children,
  defaultOpen = true,
  label,
  title,
}: {
  id: string;
  children: ReactNode;
  defaultOpen?: boolean;
  label?: string;
  title?: ReactNode;
}) {
  const [open, toggle] = useFold(id, defaultOpen);
  return (
    <div className={`fold-wrap${open ? "" : " is-collapsed"}`}>
      <button type="button" className="fold-toggle" onClick={toggle} aria-expanded={open} title={label ?? "طي / فتح"}>
        <ChevronDown size={18} className={open ? "fold-icon is-open" : "fold-icon"} />
      </button>
      {title ? <div className="fold-title">{title}</div> : null}
      {children}
    </div>
  );
}

export function CollapsiblePanel({
  id,
  className = "panel",
  heading,
  actions,
  children,
  defaultOpen = true,
  foldLabel = "طي القسم",
}: {
  id: string;
  className?: string;
  heading: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  foldLabel?: string;
}) {
  const [open, toggle] = useFold(id, defaultOpen);
  return (
    <article className={`${className}${open ? "" : " is-collapsed"}`}>
      <div className="panel-heading">
        <button type="button" className="panel-fold" onClick={toggle} aria-expanded={open} title={foldLabel}>
          <ChevronDown size={18} className={open ? "fold-icon is-open" : "fold-icon"} />
          <div className="panel-fold-copy">{heading}</div>
        </button>
        {actions ? <div className="section-title-actions" onClick={(event) => event.stopPropagation()}>{actions}</div> : null}
      </div>
      {open ? children : null}
    </article>
  );
}
