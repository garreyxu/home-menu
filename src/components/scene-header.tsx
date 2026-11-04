import type { ReactNode } from "react";
import { MapleLeaf, Persimmon } from "@/components/scene-decor";
import { SealBadge } from "@/components/seal-badge";
import { seasonRecommendation } from "@/lib/season";

export function SceneHeader({ actions }: { actions?: ReactNode }) {
  const season = seasonRecommendation(new Date());

  return (
    <header className="scene-header">
      <div className="scene-deco scene-deco-start">
        <Persimmon />
      </div>
      <div className="scene-title-lockup">
        <SealBadge id="header-seal" label="荐" decorative />
        <h1 className="page-title font-brush text-sumi">我家食堂</h1>
        <p className="scene-season">{season}</p>
      </div>
      <div className="scene-deco scene-deco-end">
        <MapleLeaf />
      </div>
      {actions ? <div className="scene-actions">{actions}</div> : null}
    </header>
  );
}
