import { Link } from "react-router-dom";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative min-h-screen flex flex-col text-[#171717] dark:text-[#ededed] overflow-hidden">

      <div className="glow" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/" className="btn-ghost btn-sm hidden sm:inline-flex">
            Back to home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[420px] animate-fade-up">
          <div className="mb-8 text-center">
            <h1 className="text-[32px] font-semibold tracking-[-0.04em] leading-tight">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-sm text-[#666] dark:text-[#a1a1a1]">{subtitle}</p>
            )}
          </div>

          <div className="surface p-7">{children}</div>

          {footer && (
            <p className="mt-6 text-center text-sm text-[#666] dark:text-[#a1a1a1]">{footer}</p>
          )}
        </div>
      </main>
    </div>
  );
}
