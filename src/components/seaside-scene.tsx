import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Dock scene split into a left piece, a tiling sea, and a right piece.
 * Each slot has `data-asset` so a later PNG/WebP can replace the CSS art
 * (hide `.scene-art` when the slot gains an image) without moving the title
 * or the actions that sit on top.
 */
export function SeasideScene({
  variant = "banner",
  children,
}: {
  variant?: "banner" | "screen";
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "seaside-scene",
        variant === "screen" && "seaside-scene-screen",
      )}
      aria-hidden={variant === "screen" ? true : undefined}
    >
      <div className="scene-sky" />
      <div className="px-sun" data-asset="sun" />
      <div className="px-cloud px-cloud-a" data-asset="cloud">
        <span />
        <span />
      </div>
      <div className="px-cloud px-cloud-b" data-asset="cloud">
        <span />
      </div>
      <div className="scene-sea" data-asset="sea-tile" />
      <div className="scene-slot scene-slot-left" data-asset="banner-left">
        <SceneLeft />
      </div>
      <div className="scene-slot scene-slot-right" data-asset="banner-right">
        <SceneRight />
      </div>
      <div className="scene-gull scene-gull-a" data-asset="gull" />
      <div className="scene-gull scene-gull-b" data-asset="gull" />
      {children}
    </div>
  );
}

function SceneLeft() {
  return (
    <div className="scene-art">
      <div className="px-palm">
        <div className="px-palm-leaf px-palm-leaf-a" />
        <div className="px-palm-leaf px-palm-leaf-b" />
        <div className="px-palm-leaf px-palm-leaf-c" />
        <div className="px-palm-trunk" />
      </div>
      <div className="px-hut">
        <div className="px-roof" />
        <div className="px-awning" />
        <div className="px-wall">
          <div className="px-window" />
          <div className="px-door" />
        </div>
        <div className="px-lantern" />
      </div>
      <div className="px-dock" />
      <div className="px-post px-post-a" />
      <div className="px-post px-post-b" />
    </div>
  );
}

function SceneRight() {
  return (
    <div className="scene-art">
      <div className="px-hill px-hill-back" />
      <div className="px-hill px-hill-front" />
      <div className="px-boat">
        <div className="px-sail" />
        <div className="px-hull" />
      </div>
      <div className="px-ring" data-asset="life-ring" />
    </div>
  );
}
