import type { Metadata } from "next";
import { DocumentsClient } from "./documents-client";
export const metadata: Metadata = { title: "الإيصالات والكشوفات | Documents" };
export default function DocumentsPage() { return <DocumentsClient/>; }
