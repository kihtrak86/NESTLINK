import { Link } from "react-router-dom";

export default function Logo({ to = "/", size = "md" }) {
  const box = size === "lg" ? "w-10 h-10 rounded-lg" : "w-7 h-7 rounded-md";
  const icon = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  const text = size === "lg" ? "text-xl" : "text-[16px]";

  return (
    <Link to={to} className="inline-flex items-center gap-2.5 group" aria-label="NestLink home">
      <span
        className={`${box} bg-gradient-to-br from-[#0070f3] to-[#8e4ec6] flex items-center justify-center`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`${icon} text-white`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
        </svg>
      </span>
      <span className={`${text} font-semibold tracking-tight`}>
        Nest<span className="font-semibold">Link</span>
      </span>
    </Link>
  );
}
