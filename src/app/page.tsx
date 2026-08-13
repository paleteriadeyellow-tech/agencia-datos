import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    session = null;
  }
  redirect(session ? "/dashboard" : "/login");
}
