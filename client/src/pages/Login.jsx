import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/ui/AuthLayout";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/app";

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim() || !form.password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      setSubmitting(true);
      await login(form.email.trim(), form.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to access your saved links."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="font-semibold text-black/60 dark:text-white/60 underline underline-offset-4">
            Sign up
          </Link>
        </>
      }
    >
      {error && <p className="notice mb-5">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange("email")}
            placeholder="you@example.com"
            className="field"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="field-label">Password</label>
            <Link
              to="/forgot-password"
              className="text-xs mb-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white underline underline-offset-4"
            >
              Forgot?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange("password")}
            placeholder="••••••••"
            className="field"
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary h-11 mt-1">
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}
