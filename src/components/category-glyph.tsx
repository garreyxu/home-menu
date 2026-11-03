import type { ReactNode } from "react";

/**
 * 16×16 category marks. Scaled in CSS at integer sizes (32/48/64).
 * `data-asset` is the hook for a later PNG/WebP icon of the same name.
 */
export function CategoryGlyph({ name }: { name: string }) {
  return (
    <span
      className="category-glyph"
      data-asset={`category-${name}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
        {glyphs[name] ?? glyphs["默认"]}
      </svg>
    </span>
  );
}

const ink = "#2B1E16";
const cream = "#FFF6E3";
const sea = "#1F8A8A";
const coral = "#E2533B";
const sun = "#F6C445";
const kelp = "#4E9F3D";
const wood = "#8B5A2B";

function R({
  x,
  y,
  w,
  h,
  fill,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}) {
  return <rect x={x} y={y} width={w} height={h} fill={fill} />;
}

const glyphs: Record<string, ReactNode> = {
  全部: (
    <>
      <R x={1} y={1} w={6} h={6} fill={sea} />
      <R x={9} y={1} w={6} h={6} fill={coral} />
      <R x={1} y={9} w={6} h={6} fill={sun} />
      <R x={9} y={9} w={6} h={6} fill={kelp} />
      <R x={2} y={2} w={4} h={4} fill={cream} />
      <R x={10} y={2} w={4} h={4} fill={cream} />
      <R x={2} y={10} w={4} h={4} fill={cream} />
      <R x={10} y={10} w={4} h={4} fill={cream} />
    </>
  ),
  家常菜: (
    <>
      <R x={3} y={4} w={10} h={2} fill={ink} />
      <R x={2} y={6} w={12} h={6} fill={coral} />
      <R x={3} y={7} w={10} h={4} fill={sun} />
      <R x={4} y={2} w={2} h={2} fill={cream} />
      <R x={7} y={1} w={2} h={3} fill={cream} />
      <R x={10} y={2} w={2} h={2} fill={cream} />
    </>
  ),
  汤: (
    <>
      <R x={3} y={6} w={10} h={2} fill={ink} />
      <R x={2} y={8} w={12} h={5} fill={sea} />
      <R x={4} y={9} w={8} h={3} fill={cream} />
      <R x={5} y={2} w={1} h={3} fill={ink} />
      <R x={8} y={1} w={1} h={4} fill={ink} />
      <R x={11} y={2} w={1} h={3} fill={ink} />
    </>
  ),
  汤品: (
    <>
      <R x={3} y={6} w={10} h={2} fill={ink} />
      <R x={2} y={8} w={12} h={5} fill={sea} />
      <R x={4} y={9} w={8} h={3} fill={cream} />
      <R x={5} y={2} w={1} h={3} fill={ink} />
      <R x={8} y={1} w={1} h={4} fill={ink} />
      <R x={11} y={2} w={1} h={3} fill={ink} />
    </>
  ),
  海鲜: (
    <>
      <R x={2} y={6} w={9} h={4} fill={sea} />
      <R x={11} y={5} w={3} h={2} fill={sea} />
      <R x={11} y={9} w={3} h={2} fill={sea} />
      <R x={4} y={7} w={2} h={2} fill={ink} />
      <R x={3} y={5} w={2} h={1} fill={kelp} />
      <R x={6} y={10} w={3} h={1} fill={kelp} />
    </>
  ),
  主食: (
    <>
      <R x={3} y={5} w={10} h={2} fill={ink} />
      <R x={2} y={7} w={12} h={6} fill={wood} />
      <R x={4} y={8} w={8} h={4} fill={cream} />
      <R x={6} y={3} w={4} h={2} fill={sun} />
    </>
  ),
  甜点: (
    <>
      <R x={2} y={8} w={12} h={5} fill={sun} />
      <R x={3} y={9} w={10} h={3} fill={coral} />
      <R x={7} y={3} w={2} h={5} fill={cream} />
      <R x={5} y={4} w={6} h={2} fill={cream} />
    </>
  ),
  凉菜: (
    <>
      <R x={2} y={6} w={12} h={3} fill={cream} />
      <R x={3} y={9} w={10} h={3} fill={sea} />
      <R x={5} y={4} w={2} h={2} fill={kelp} />
      <R x={8} y={3} w={2} h={3} fill={kelp} />
      <R x={11} y={5} w={2} h={1} fill={coral} />
    </>
  ),
  默认: (
    <>
      <R x={3} y={4} w={10} h={2} fill={ink} />
      <R x={2} y={6} w={12} h={6} fill={cream} />
      <R x={4} y={7} w={8} h={4} fill={sun} />
    </>
  ),
};
