import { seedCategories, seedDishes } from "@/server/db/seed-data";
import {
  groupActiveDishesByCategory,
  type CategoryDishJoinRow,
  type CategoryWithDishes,
} from "@/server/menu-view";

/** Sample menu for local dev and CI when DATABASE_URL is unset. Ids are stable, not UUIDs. */
export function sampleDishCatalog(): CategoryWithDishes[] {
  const rows: CategoryDishJoinRow[] = [];

  for (const category of seedCategories) {
    const dishes = seedDishes.filter(
      (dish) => dish.categoryName === category.name,
    );
    if (dishes.length === 0) {
      rows.push({
        categoryId: `sample-category:${category.name}`,
        categoryName: category.name,
        sortOrder: category.sortOrder,
        dishId: null,
        notionPageId: null,
        dishName: null,
        description: null,
        photoKey: null,
        isActive: null,
        tried: null,
        hasBody: null,
      });
      continue;
    }

    for (const dish of dishes) {
      rows.push({
        categoryId: `sample-category:${category.name}`,
        categoryName: category.name,
        sortOrder: category.sortOrder,
        dishId: `sample-dish:${dish.name}`,
        notionPageId: null,
        dishName: dish.name,
        description: dish.description,
        photoKey: null,
        isActive: true,
        tried: false,
        hasBody: null,
      });
    }
  }

  return groupActiveDishesByCategory(rows);
}
