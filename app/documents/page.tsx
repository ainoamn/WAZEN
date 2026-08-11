import type { Metadata } from "next";
import { DocumentsClient } from "./documents-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مركز الإيصالات والكشوفات" };
export default function DocumentsPage() { return <DocumentsClient/>; }
