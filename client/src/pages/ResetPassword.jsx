import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { resetPasswordRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      const data = await resetPasswordRequest(token, form.password);
      // Reset endpoint returns a fresh token — log the user straight in.
      localStorage.setItem("tabshelf_token", data.token);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/"; // full reload so AuthContext re-bootstraps with new token
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.message || "This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-card p-8">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Nest<span className="text-brand-600">Link</span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">Set a new password</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Choose a new password for your account.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-3 py-2 rounded-lg mb-4">
            {error}
          </p>
        )}

        {success ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-3 rounded-lg">
            Password updated! Redirecting you in...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New password</label>
              <input
                type="password"
                value={form.password}
                onChange={handleChange("password")}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                placeholder="Re-enter password"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-60"
            >
              {submitting ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-6">
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
