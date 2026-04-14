import { redirect } from "next/navigation";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await searchParams;
  redirect("/dashboard/posts");
}
