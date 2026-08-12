import type { Metadata } from "next"; import { PasswordRecovery } from "../password-recovery";
export const metadata: Metadata = { title: "استعادة كلمة المرور" }; export default function Page(){ return <PasswordRecovery mode="forgot" />; }
