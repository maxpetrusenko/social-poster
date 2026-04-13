import { redirect } from "next/navigation";

export default function NewPlatformPage() {
  redirect("/dashboard/platforms?connect=1");
}
