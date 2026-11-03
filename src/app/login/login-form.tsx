"use client";

import { useActionState, useEffect, useRef } from "react";
import { login } from "@/app/login/actions";
import { PixelButton, PixelFrame } from "@/components/pixel-frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/auth/messages";

const fieldClass =
  "h-11 rounded-none border-2 border-ink bg-cream px-3 text-base text-ink shadow-none focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:ring-2 focus-visible:ring-sun";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState<
    LoginState | null,
    FormData
  >(login, null);
  const signRef = useRef<HTMLDivElement>(null);
  const invalid = Boolean(state?.error);

  useEffect(() => {
    const sign = signRef.current;
    if (!sign || !state?.error) return;
    // Remove and re-add so a later failure replays the one-shot animation.
    sign.classList.remove("pixel-shake");
    void sign.offsetWidth;
    sign.classList.add("pixel-shake");
  }, [state]);

  return (
    <div
      ref={signRef}
      className="w-full max-w-sm"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName !== "pixel-shake") return;
        event.currentTarget.classList.remove("pixel-shake");
      }}
    >
      <PixelFrame faceClassName="flex flex-col gap-5 px-5 py-6 sm:px-6">
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-pixel pixel-type text-pixel-2 text-ink sm:text-pixel-3">
              我家海上食堂
            </h1>
            <p className="text-sm text-driftwood">登录</p>
          </div>
          <input type="hidden" name="next" value={nextPath} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="text-ink">
              用户名
            </Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "login-error" : undefined}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-ink">
              密码
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "login-error" : undefined}
              className={fieldClass}
            />
          </div>
          {state?.error ? (
            <p
              id="login-error"
              role="alert"
              className="text-sm text-coral-deep"
            >
              {state.error}
            </p>
          ) : null}
          <PixelButton
            type="submit"
            size="md"
            className="w-full"
            disabled={pending}
          >
            开店
          </PixelButton>
        </form>
      </PixelFrame>
    </div>
  );
}
