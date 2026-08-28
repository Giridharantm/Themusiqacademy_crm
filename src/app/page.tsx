import { redirect } from "next/navigation";
import { currentUser } from "@/lib/authz";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "TEACHER") redirect("/teacher");
  redirect("/parent");
}
