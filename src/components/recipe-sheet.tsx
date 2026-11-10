"use client";

import { formatCookTime } from "@/lib/cook-time";

import { startTransition, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadDishRecipe } from "@/app/recipe-actions";
import { RecipeBody } from "@/components/recipe-body";
import { StampButton } from "@/components/stamp-button";
import type { DishIllustration } from "@/lib/illustrations";
import type { RecipeBlock } from "@/lib/recipe-blocks";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      name: string;
      blocks: RecipeBlock[];
      cookTime?: string | null;
      mainIngredient?: string | null;
      tried: boolean;
    }
  | { status: "error"; message: string };

export function RecipeSheet({
  dishId,
  dishName,
  onClose,
  onAdd,
  illustration,
  tried = false,
}: {
  dishId: string;
  dishName: string;
  onClose: () => void;
  onAdd: () => void;
  illustration?: DishIllustration | null;
  tried?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      void loadDishRecipe(dishId).then(
        (result) => {
          if (cancelled) return;
          if (!result.ok) {
            setState({ status: "error", message: result.error });
            return;
          }
          setState({
            status: "ready",
            name: result.name,
            blocks: result.blocks,
            cookTime: result.cookTime,
            mainIngredient: result.mainIngredient,
            tried: result.tried,
          });
        },
        () => {
          if (!cancelled) {
            setState({
              status: "error",
              message: "做法没能打开，请再试一次。",
            });
          }
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [dishId, attempt]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [dishId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = state.status === "ready" ? state.name : dishName;
  const isTried = state.status === "ready" ? state.tried : tried;

  return createPortal(
    <div
      className="recipe-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="recipe-panel frame-panel frame-panel-a"
      >
        <header className="recipe-header">
          <div className="recipe-art">
            {illustration ? (
              // Static generated illustration; keep responsive files without an optimizer fetch.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={illustration.src}
                srcSet={illustration.srcSet}
                sizes="(min-width: 640px) 480px, 100vw"
                alt=""
                className="illus-blend recipe-header-image"
              />
            ) : (
              <span
                className="recipe-art-fallback font-brush"
                aria-hidden="true"
              >
                {Array.from(title)[0]}
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="recipe-close focus-ring"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
          <div className="recipe-heading-area">
            <div className="recipe-toolbar">
              <h2 id={titleId} className="recipe-title font-brush text-sumi">
                {title}
              </h2>
              <StampButton onClick={onAdd}>＋添加</StampButton>
            </div>
            {(state.status === "ready" &&
              (state.cookTime || state.mainIngredient)) ||
            isTried ? (
              <div className="recipe-tags">
                {state.status === "ready" && state.cookTime ? (
                  <span>⏱ {formatCookTime(state.cookTime)}</span>
                ) : null}
                {state.status === "ready" && state.mainIngredient ? (
                  <span>{state.mainIngredient}</span>
                ) : null}
                {isTried ? <span>做过</span> : null}
              </div>
            ) : null}
          </div>
        </header>
        <div className="recipe-scroll">
          {state.status === "loading" ? (
            <p className="recipe-empty">正在打开做法</p>
          ) : null}
          {state.status === "error" ? (
            <div className="recipe-error">
              <p>{state.message}</p>
              <button
                type="button"
                className="week-nav-link frame-tag frame-tag-b focus-ring"
                onClick={() => {
                  setState({ status: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                再试一次
              </button>
            </div>
          ) : null}
          {state.status === "ready" ? (
            <RecipeBody blocks={state.blocks} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
