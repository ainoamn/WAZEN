import type { ReactNode } from "react";
import { AdminConsoleGate } from "./admin-gate";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminConsoleGate>{children}</AdminConsoleGate>;
}
