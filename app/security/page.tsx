import type { Metadata } from "next"; import { LegalPage } from "../legal-page";
export const metadata: Metadata = { title: "مركز الأمان" }; export default function Page(){ return <LegalPage kind="security" />; }
