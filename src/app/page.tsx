import { Button } from "@/components/ui/button";
import { formatSiteHeading } from "@/lib/site";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex justify-end px-4 py-4">
        <form action="/logout" method="post">
          <Button type="submit" variant="outline">
            退出
          </Button>
        </form>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {formatSiteHeading()}
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          家庭每周菜单正在搭建。这一页只是占位，菜品和周菜单会在后面的版本里出现。
        </p>
        <Button disabled type="button">
          即将开放
        </Button>
      </div>
    </main>
  );
}
