import { frameLetter } from "@/lib/frames";
import { categoryFilterHref } from "@/lib/category-filter";

export type CategoryNavItem = {
  name: string;
};

export function CategoryNav({
  categories,
  selected,
  week = null,
}: {
  categories: readonly CategoryNavItem[];
  /** Null means 全部. An unknown name matches nothing, including 全部. */
  selected: string | null;
  /** Sunday week start to keep while changing category. */
  week?: string | null;
}) {
  return (
    <nav aria-label="菜品分类" className="category-nav">
      <ul className="category-nav-list">
        <li>
          <TagLink
            href={categoryFilterHref(null, week)}
            current={selected === null}
            id="category-all"
            name="全部"
          />
        </li>
        {categories.map((category) => (
          <li key={category.name}>
            <TagLink
              href={categoryFilterHref(category.name, week)}
              current={selected === category.name}
              id={category.name}
              name={category.name}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TagLink({
  href,
  current,
  id,
  name,
}: {
  href: string;
  current: boolean;
  id: string;
  name: string;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      className={`wood-tag frame-tag frame-tag-${frameLetter(id)} focus-ring shrink-0 lg:w-full`}
    >
      <span className="wood-hole" aria-hidden="true" />
      <span className="wood-label font-brush" title={name}>
        {name}
      </span>
    </a>
  );
}
