import type { Metadata } from "next"; import { LegalPage } from "../legal-page";
export const metadata: Metadata = { title: "سياسة الخصوصية" }; export default function Page(){ return <LegalPage kind="privacy" />; }
