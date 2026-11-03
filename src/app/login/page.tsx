import type { Metadata } from "next";
import { SeasideScene } from "@/components/seaside-scene";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { firstQueryValue } from "@/lib/category-filter";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录 · 我家海上食堂",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(firstQueryValue(params.next));

  return (
    <main className="relative min-h-svh">
      <SeasideScene variant="screen" />
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4 py-10">
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
