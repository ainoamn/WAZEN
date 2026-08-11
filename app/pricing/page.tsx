import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = { title: "الباقات والاشتراكات" };
export default function PricingPage() { return <PricingClient />; }
