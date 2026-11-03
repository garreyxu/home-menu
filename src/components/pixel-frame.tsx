import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pixel chrome used across the site.
 * `.pixel-face` is the only painted surface (2px ink border, 2px clipped
 * corners). A later art pass can set a 9-slice border-image on that face
 * without moving children. `.pixel-shadow` is the solid 4px offset.
 */
export function PixelFrame({
  className,
  faceClassName,
  children,
}: {
  className?: string;
  faceClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("pixel-hit", className)}>
      <div className="pixel-shadow">
        <div className={cn("pixel-face", faceClassName)}>{children}</div>
      </div>
    </div>
  );
}

type PixelTone = "coral" | "cream" | "sea";
type PixelSize = "sm" | "md";

export function PixelButton({
  tone = "coral",
  size = "md",
  className,
  faceClassName,
  children,
  ...props
}: ComponentProps<"button"> & {
  tone?: PixelTone;
  size?: PixelSize;
  faceClassName?: string;
}) {
  return (
    <button
      className={cn("pixel-hit pixel-press", `pixel-tone-${tone}`, className)}
      {...props}
    >
      <span className="pixel-shadow">
        <span
          className={cn(
            "pixel-face pixel-button-face font-pixel pixel-type",
            size === "sm" ? "text-pixel-1" : "text-pixel-2",
            faceClassName,
          )}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

export function PixelLink({
  href,
  current = false,
  className,
  children,
}: {
  href: string;
  current?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "pixel-hit pixel-press pixel-tone-cream",
        current && "is-pressed",
        className,
      )}
    >
      <span className="pixel-shadow">
        <span className="pixel-face pixel-button-face justify-start text-left font-pixel pixel-type text-pixel-2">
          {children}
        </span>
      </span>
    </a>
  );
}
