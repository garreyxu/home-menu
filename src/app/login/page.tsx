import type { Metadata } from "next";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录 · 家庭菜单",
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(firstQueryValue(params.next));

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
