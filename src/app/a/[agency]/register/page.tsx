"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Radio } from "lucide-react";
import { registerManager } from "@/lib/actions";
import { Button, Field, inputClass } from "@/components/ui";
import { useAgency } from "@/lib/use-agency";

export default function RegisterPage() {
  const router = useRouter();
  const { slug, name, path } = useAgency();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      form.set("agencySlug", slug);
      const res = await registerManager(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(path("/login"));
    } catch {
      setError("Error de conexión. Revisa la base de datos o intenta de nuevo.");
    } finally {
      setLoading(false);
    }
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
              Crear cuenta
            </h1>
            <p className="text-sm text-text-muted">{name}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre">
            <input name="name" required className={inputClass} placeholder="Tu nombre" />
          </Field>
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
              minLength={6}
              className={inputClass}
              placeholder="Mínimo 6 caracteres"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando…" : "Crear cuenta"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href={path("/login")} className="text-accent hover:underline">
            Iniciar sesión
          </Link>
          {" · "}
          <Link href="/" className="text-accent hover:underline">
            Cambiar agencia
          </Link>
        </p>
      </div>
    </div>
  );
}
