import type { ReactNode } from "react";
import { Link } from "react-router";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-soft-mint px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <Link
          aria-label="DealFlow home"
          className="mx-auto flex w-fit items-center gap-3"
          to="/"
        >
          <img
            alt=""
            className="size-12 rounded-xl object-cover"
            height="1024"
            src="/brand/dealflow-symbol-recraft.png"
            width="1024"
          />
          <img
            alt=""
            className="h-9 w-36 object-cover object-center"
            height="768"
            src="/brand/dealflow-wordmark-dark.svg"
            width="1536"
          />
        </Link>
        <div className="mt-8 rounded-3xl border border-line bg-white p-6 shadow-card sm:p-9">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-ink-faint">
          A more considered way to navigate business transitions.
        </p>
      </div>
    </main>
  );
}
