import type { ReactNode } from "react";
import { PixelFrame } from "@/components/pixel-frame";
import { SeasideScene } from "@/components/seaside-scene";

export function SceneHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="relative">
      <SeasideScene variant="banner">
        <div className="scene-title">
          <PixelFrame faceClassName="px-3 py-2 sm:px-4">
            <h1 className="font-pixel pixel-type text-pixel-2 text-ink sm:text-pixel-3">
              我家海上食堂
            </h1>
          </PixelFrame>
        </div>
        {actions ? <div className="scene-actions">{actions}</div> : null}
      </SeasideScene>
    </header>
  );
}
