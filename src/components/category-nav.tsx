import { CategoryGlyph } from "@/components/category-glyph";
import { PixelLink } from "@/components/pixel-frame";
import { categoryFilterHref } from "@/lib/category-filter";

export type CategoryNavItem = {
  name: string;
};

export function CategoryNav({
  categories,
  selected,
}: {
  categories: readonly CategoryNavItem[];
  selected: string | null;
}) {
  return (
    <nav aria-label="菜品分类" className="category-nav">
      <ul className="category-nav-list">
        <li className="lg:w-full">
          <PixelLink
            href={categoryFilterHref(null)}
            current={selected === null}
            className="shrink-0 lg:w-full"
          >
            <CategoryGlyph name="全部" />
            <span className="min-w-0 truncate">全部</span>
          </PixelLink>
        </li>
        {categories.map((category) => (
          <li key={category.name} className="lg:w-full">
            <PixelLink
              href={categoryFilterHref(category.name)}
              current={selected === category.name}
              className="shrink-0 lg:w-full"
            >
              <CategoryGlyph name={category.name} />
              <span className="min-w-0 truncate" title={category.name}>
                {category.name}
              </span>
            </PixelLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
