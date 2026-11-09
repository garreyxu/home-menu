"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { login } from "@/app/login/actions";
import { StampButton } from "@/components/stamp-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/auth/messages";
import { siteName } from "@/lib/site";

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function Countdown({ ms }: { ms: number }) {
  const started = useState(() => Date.now())[0];
  const [now, setNow] = useState(started);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span> {formatRemaining(Math.max(0, ms - (now - started)))}</span>;
}

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
    sign.classList.remove("ink-shake");
    void sign.offsetWidth;
    sign.classList.add("ink-shake");
  }, [state]);

  return (
    <div
      ref={signRef}
      className="frame-panel frame-panel-a w-full max-w-sm"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName !== "ink-shake") return;
        event.currentTarget.classList.remove("ink-shake");
      }}
    >
      <form
        action={formAction}
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="page-title font-brush text-sumi">{siteName}</h1>
          <p className="text-sm text-sumi-soft">登录</p>
        </div>
        <input type="hidden" name="next" value={nextPath} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="username" className="text-sumi">
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
            className="login-field focus-ring"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-sumi">
            密码
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "login-error" : undefined}
            className="login-field focus-ring"
          />
        </div>
        {state?.error ? (
          <p id="login-error" role="alert" className="text-sm text-shu">
            {state.error}
            {state.retryAfterMs ? (
              <Countdown key={state.retryAfterMs} ms={state.retryAfterMs} />
            ) : null}
          </p>
        ) : null}
        <StampButton type="submit" className="w-full" disabled={pending}>
          开门
        </StampButton>
      </form>
    </div>
  );
}
