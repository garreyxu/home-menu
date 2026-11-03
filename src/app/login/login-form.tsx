"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";
import { PixelButton, PixelFrame } from "@/components/pixel-frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/auth/messages";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-11 rounded-none border-2 border-ink bg-cream px-3 text-base text-ink shadow-none focus-visible:border-sea focus-visible:ring-2 focus-visible:ring-sun";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState<
    LoginState | null,
    FormData
  >(login, null);
  const invalid = Boolean(state?.error);

  return (
    <div className={cn("w-full max-w-sm", invalid && "pixel-shake")}>
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
            <p id="login-error" role="alert" className="text-sm text-coral-ink">
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
