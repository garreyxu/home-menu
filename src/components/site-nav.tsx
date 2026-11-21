import Link from "next/link";

export function SiteNav({ current }: { current: "menu" | "drinks" }) {
  return (
    <nav aria-label="主菜单" className="site-nav">
      <Link
        href="/"
        className="frame-tag frame-tag-a focus-ring"
        aria-current={current === "menu" ? "page" : undefined}
      >
        菜单
      </Link>
      <Link
        href="/drinks"
        className="frame-tag frame-tag-b focus-ring"
        aria-current={current === "drinks" ? "page" : undefined}
      >
        酒单
      </Link>
    </nav>
  );
}
