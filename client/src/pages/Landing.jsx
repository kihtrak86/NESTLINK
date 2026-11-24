import { Link } from "react-router-dom";
import Logo from "../components/ui/Logo";
import ThemeToggle from "../components/ui/ThemeToggle";

const features = [
  {
    title: "AI semantic search",
    color: "#8e4ec6",
    body: "Describe what you remember, not the exact words. Results are ranked by meaning.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
  },
  {
    title: "Folders and tags",
    color: "#0070f3",
    body: "Group links into folders, then slice across them with tags. Structure that stays out of your way.",
    icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  {
    title: "Fast and private",
    color: "#30a46c",
    body: "Your shelf is tied to your account and nothing else. No feeds, no clutter, no noise.",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  },
];

const steps = [
  { n: "1", color: "#0070f3", title: "Save", body: "Add a link with a title, a short note and a few tags." },
  { n: "2", color: "#8e4ec6", title: "Organize", body: "File it into a folder. Create new folders on the fly." },
  { n: "3", color: "#e93d82", title: "Find", body: "Search by keyword, or let AI find it by meaning." },
];

import { badgeStyle, colorFor } from "../utils/colors";

function PreviewCard({ title, host, folder, tags, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-[#ebebeb] dark:border-[#242424] bg-white dark:bg-[#0a0a0a] p-4 text-left ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: colorFor(host) }}>{title.charAt(0)}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            <p className="text-xs text-[#666] dark:text-[#a1a1a1] truncate">{host}</p>
          </div>
        </div>
        <span className="chip"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorFor(folder) }} />{folder}</span>
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="h-1 w-full rounded-full bg-black/10 dark:bg-white/10" />
        <div className="h-1 w-2/3 rounded-full bg-black/10 dark:bg-white/10" />
      </div>
      <div className="mt-4 flex gap-1.5">
        {tags.map((t) => (
          <span key={t} className="chip" style={badgeStyle(t)}>#{t}</span>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen text-[#171717] dark:text-[#ededed]">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-[#fafafa]/80 dark:bg-black/80 backdrop-blur-md border-b border-[#ebebeb] dark:border-[#242424]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <a href="#features" className="btn-ghost btn-sm hidden sm:inline-flex">Features</a>
            <a href="#how" className="btn-ghost btn-sm hidden sm:inline-flex">How it works</a>
            <ThemeToggle className="mx-1" />
            <Link to="/login" className="btn-secondary btn-sm">Log in</Link>
            <Link to="/signup" className="btn-primary btn-sm hidden sm:inline-flex">Sign up</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="glow" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <h1
            className="text-[40px] sm:text-[72px] font-semibold tracking-[-0.045em] leading-[1.02] animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            Every link you save,
            <br />
            exactly where you left it.
          </h1>
          <p
            className="mt-6 mx-auto max-w-xl text-base sm:text-xl text-[#666] dark:text-[#a1a1a1] leading-relaxed animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            NestLink is a quiet, fast home for the things worth keeping. Organize with folders and
            tags, then find anything by describing it.
          </p>
          <div
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            <Link to="/signup" className="btn-primary btn-lg w-full sm:w-auto">Get started free</Link>
            <Link to="/login" className="btn-secondary btn-lg w-full sm:w-auto">Log in</Link>
          </div>

          {/* Product preview */}
          <div
            className="relative mt-16 mx-auto max-w-4xl animate-fade-up"
            style={{ animationDelay: "260ms" }}
          >
            <div className="surface p-3 sm:p-4 shadow-pop dark:shadow-none">
              <div className="flex items-center gap-1.5 px-1 pb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-[#e5e5e5] dark:border-[#2e2e2e] px-3 h-10 mb-3 text-left">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#8e4ec6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <span className="text-sm text-[#8f8f8f]">backend auth and API security</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PreviewCard title="OAuth 2.0 explained" host="oauth.net" folder="Security" tags={["auth", "api"]} />
                <PreviewCard
                  title="JWT best practices"
                  host="auth0.com"
                  folder="Backend"
                  tags={["jwt", "tokens"]}
                  className="hidden sm:block"
                />
                <PreviewCard
                  title="Rate limiting patterns"
                  host="cloudflare.com"
                  folder="Backend"
                  tags={["scale"]}
                  className="hidden sm:block"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-14">
        <div className="max-w-xl">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[1.05]">
            Less to manage. More to find.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="surface p-7 min-h-[240px] flex flex-col hover:border-[#c9c9c9] dark:hover:border-[#454545]">
              <div className="w-10 h-10 rounded-lg border flex items-center justify-center" style={{ color: f.color, backgroundColor: `${f.color}1a`, borderColor: `${f.color}40` }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                </svg>
              </div>
              <h3 className="mt-auto pt-10 text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#666] dark:text-[#a1a1a1]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-14 border-t border-[#ebebeb] dark:border-[#242424]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.04em]">Three steps. That's it.</h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="w-8 h-8 rounded-full text-white text-sm font-semibold flex items-center justify-center" style={{ backgroundColor: s.color }}>{s.n}</span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#666] dark:text-[#a1a1a1]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28">
        <div className="surface relative overflow-hidden px-6 py-20 sm:py-24 text-center">
          <div className="rainbow-bar absolute top-0 inset-x-0" aria-hidden="true" />
          <h2 className="relative text-3xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[1.05]">
            Start your shelf today.
          </h2>
          <p className="relative mt-5 text-[#666] dark:text-[#a1a1a1]">Free to use. No clutter.</p>
          <Link
            to="/signup"
            className="btn-primary btn-lg relative mt-10"
          >
            Create your account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#ebebeb] dark:border-[#242424]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-[#8f8f8f]">
            &copy; {new Date().getFullYear()} NestLink. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
