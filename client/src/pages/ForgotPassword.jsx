import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordRequest } from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setSubmitting(true);

      await forgotPasswordRequest(email.trim());

      setSubmitted(true);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-card p-8">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"
              />
            </svg>
          </div>

          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Nest<span className="text-brand-600">Link</span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Reset your password
        </h1>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Enter your email and we'll send you a password reset link.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-3 py-2 rounded-lg mb-4">
            {error}
          </p>
        )}

        {submitted ? (
          <div className="flex flex-col gap-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg px-4 py-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                If an account exists for that email, we've sent a password reset
                link.
              </p>

              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-2">
                Please check your inbox and spam folder.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-6">
          Remembered your password?{" "}
          <Link
            to="/login"
            className="text-brand-600 font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}