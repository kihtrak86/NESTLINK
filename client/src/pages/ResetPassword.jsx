import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { resetPasswordRequest } from "../services/api";
import AuthLayout from "../components/ui/AuthLayout";

export default function ResetPassword() {
  const { token } = useParams();

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
      // Reset endpoint returns a fresh token, so log the user straight in.
      localStorage.setItem("tabshelf_token", data.token);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/app"; // full reload so AuthContext re-bootstraps with new token
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.message || "This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={
        <Link to="/login" className="font-semibold text-black/60 dark:text-white/60 underline underline-offset-4">
          Back to login
        </Link>
      }
    >
      {error && <p className="notice mb-5">{error}</p>}

      {success ? (
        <p className="rounded-xl border border-black/10 dark:border-white/10  px-4 py-3 text-sm">
          Password updated. Redirecting you...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div>
            <label htmlFor="password" className="field-label">New password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange("password")}
              placeholder="At least 6 characters"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="field-label">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange("confirmPassword")}
              placeholder="Re-enter password"
              className="field"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary h-11 mt-1">
            {submitting ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
