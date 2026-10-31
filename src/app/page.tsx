import { Button } from "@/components/ui/button";
import { formatSiteHeading } from "@/lib/site";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {formatSiteHeading()}
      </h1>
      <p className="max-w-md text-balance text-muted-foreground">
        家庭每周菜单正在搭建。这一页只是占位，菜品和周菜单会在后面的版本里出现。
      </p>
      <Button disabled type="button">
        即将开放
      </Button>
    </main>
  );
}
