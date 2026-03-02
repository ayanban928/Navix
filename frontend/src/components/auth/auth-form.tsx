"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-session";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { login, signup } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "login" ? "Welcome back" : "Create account";
  const actionLabel = mode === "login" ? "Log in" : "Sign up";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login(identifier, password);
      } else {
        await signup(username, email, password);
      }
      router.push("/app");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Authentication failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">Navix</p>
        <h1>{title}</h1>
        <p className="authSubtext">
          {mode === "login"
            ? "Use your email or username to access your trips."
            : "Create your account with username and email."}
        </p>

        {mode === "login" ? (
          <p className="authDemoHint">
            Demo account: <strong>{DEMO_EMAIL}</strong> / <strong>{DEMO_PASSWORD}</strong>
          </p>
        ) : null}

        <form className="authForm" onSubmit={handleSubmit}>
          {mode === "login" ? (
            <label>
              Email or Username
              <input
                autoComplete="username"
                onChange={(event) => setIdentifier(event.target.value)}
                required
                type="text"
                value={identifier}
              />
            </label>
          ) : (
            <>
              <label>
                Username
                <input
                  autoComplete="username"
                  minLength={3}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  type="text"
                  value={username}
                />
              </label>

              <label>
                Email
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
            </>
          )}

          <label>
            Password
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="authError">{error}</p> : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Submitting..." : actionLabel}
          </button>
        </form>

        <p className="authSwitch">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <Link href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Sign up" : "Log in"}
          </Link>
        </p>
      </section>
    </main>
  );
}
