import type { Metadata } from "next";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { siteName } from "@/lib/site";
import { firstQueryValue } from "@/lib/category-filter";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: `登录 · ${siteName}`,
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(firstQueryValue(params.next));

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
