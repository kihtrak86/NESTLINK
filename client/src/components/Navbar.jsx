import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./ui/Logo";
import ThemeToggle from "./ui/ThemeToggle";

export default function Navbar({ onAddClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 bg-[#fafafa]/80 dark:bg-black/80 backdrop-blur-md border-b border-[#ebebeb] dark:border-[#242424]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Logo to="/app" />

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <button onClick={onAddClick} className="btn-primary h-8 px-3 sm:px-3.5 text-[13px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add bookmark</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-black/10 dark:border-white/10">
              <div
                title={user.name}
                className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0070f3] via-[#8e4ec6] to-[#e93d82] text-white flex items-center justify-center text-xs font-semibold"
              >
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <button onClick={handleLogout} className="btn-ghost h-8 px-2 text-[13px]">
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
