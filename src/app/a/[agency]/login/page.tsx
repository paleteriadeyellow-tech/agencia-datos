"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Radio } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { useAgency } from "@/lib/use-agency";

export default function LoginPage() {
  const router = useRouter();
  const { slug, name, path } = useAgency();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      agencySlug: slug,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email o contraseña incorrectos.");
      return;
    }
    router.push(path("/dashboard"));
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel relative z-10 w-full max-w-md rounded-2xl p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
            <Radio className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
              {name}
            </h1>
            <p className="text-sm text-text-muted">Acceso managers · Backstage</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              className={inputClass}
              placeholder="manager@agencia.com"
            />
          </Field>
          <Field label="Contraseña">
            <input
              name="password"
              type="password"
              required
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar al panel"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          <Link href="/" className="text-accent hover:underline">
            Cambiar agencia
          </Link>
        </p>
      </div>
    </div>
  );
}
