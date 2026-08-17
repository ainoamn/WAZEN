"use client";

import { type ReactNode } from "react";

export function AdminConsole({ children }: { children: ReactNode }) {
  return <div className="admin-console">{children}</div>;
}

export function AdminSwitch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`plan-switch${on ? " is-on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <i />
    </button>
  );
}

export function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td className="admin-empty-cell" colSpan={cols}>{message}</td>
    </tr>
  );
}
