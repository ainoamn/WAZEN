import { redirect } from "next/navigation";

export default function BrandRedirectPage() {
  redirect("/about#logo");
}
