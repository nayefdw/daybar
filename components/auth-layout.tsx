"use client";
// The frame of the pages before signing in (sign-in, registration, password
// reset, second factor, linking an account): on wide screens split in two –
// on the left a panel in Daybar's colours with the logo and one line, on
// the right the page's own column. Phones and narrow windows show only the
// column (app/globals.css, "Sign-in: split layout").
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { useT } from "./i18n";

export function AuthLayout({
  children,
  instanceName = "",
  className = "",
  signedOut = false,
}: {
  children: ReactNode;
  instanceName?: string;
  className?: string;
  // data-signed-out: the offline service worker (public/sw.js) does not
  // store this page as the app.
  signedOut?: boolean;
}) {
  const t = useT();
  return (
    <main className={`login auth-split${className ? ` ${className}` : ""}`} data-signed-out={signedOut ? "" : undefined}>
      <div className="auth-panel">
        <div className="auth-panel-brand">
          <BrandMark size={34} />
          daybar
          {instanceName && <span className="auth-panel-instance"> · {instanceName}</span>}
        </div>
        <p className="auth-panel-line">
          {t("Dein Tag,", "Your day,")}
          <br />
          {t("auf einen Blick.", "at a glance.")}
        </p>
      </div>
      <div className="auth-side">{children}</div>
    </main>
  );
}
