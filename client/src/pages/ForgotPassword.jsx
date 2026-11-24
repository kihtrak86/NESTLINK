import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordRequest } from "../services/api";
import AuthLayout from "../components/ui/AuthLayout";

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
      setError(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered your password?{" "}
          <Link to="/login" className="font-semibold text-black/60 dark:text-white/60 underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      {error && <p className="notice mb-5">{error}</p>}

      {submitted ? (
        <div className="rounded-xl border border-black/10 dark:border-white/10  px-4 py-4">
          <p className="text-sm">If an account exists for that email, we've sent a password reset link.</p>
          <p className="text-xs text-black/60 dark:text-white/60 mt-2">
            Please check your inbox and spam folder.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary h-11 mt-1">
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
