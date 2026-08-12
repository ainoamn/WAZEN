import type { Metadata } from "next"; import { LegalPage } from "../legal-page";
export const metadata: Metadata = { title: "شروط الاستخدام" }; export default function Page(){ return <LegalPage kind="terms" />; }
