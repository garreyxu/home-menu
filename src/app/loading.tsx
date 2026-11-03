import { DishCardSkeleton } from "@/components/dish-card";
import { SceneHeader } from "@/components/scene-header";

export default function Loading() {
  return (
    <div className="overflow-x-clip" aria-busy="true" aria-live="polite">
      <SceneHeader />
      <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <DishCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
