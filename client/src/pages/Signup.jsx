import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/ui/AuthLayout";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError("Please fill out all fields.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      setSubmitting(true);
      await signup(form.name.trim(), form.email.trim(), form.password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to sign up. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start saving links in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-black/60 dark:text-white/60 underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      {error && <p className="notice mb-5">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div>
          <label htmlFor="name" className="field-label">Name</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={handleChange("name")}
            placeholder="Jane Doe"
            className="field"
          />
        </div>
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
          <label htmlFor="password" className="field-label">Password</label>
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
        <button type="submit" disabled={submitting} className="btn-primary h-11 mt-1">
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
