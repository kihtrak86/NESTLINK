export default function Spinner({ className = "w-6 h-6" }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`${className} rounded-full border-2 border-black/10 dark:border-white/10 border-t-black dark:border-t-white animate-spin`}
    />
  );
}
