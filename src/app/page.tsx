import Link from "next/link";
import { AGENCIES, agencyPath } from "@/lib/agencies";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 20%, rgba(34,211,238,0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 75%, rgba(244,63,94,0.16), transparent 50%), linear-gradient(165deg, #0a0f14 0%, #121a22 45%, #0d141c 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.35em] text-cyan/90 animate-[fadeIn_0.6s_ease-out]">
          Backstage
        </p>
        <h1 className="max-w-3xl font-[family-name:var(--font-syne)] text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl animate-[fadeIn_0.8s_ease-out]">
          Elige tu agencia
        </h1>
        <p className="mt-5 max-w-xl text-base text-text-muted sm:text-lg animate-[fadeIn_1s_ease-out]">
          Cada agencia tiene su propio panel y sus datos por separado. Nada se
          mezcla.
        </p>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 animate-[fadeIn_1.1s_ease-out]">
          <Link
            href={agencyPath(AGENCIES.streamersfederation.slug, "/login")}
            className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10 transition duration-300 hover:border-cyan/40 hover:bg-white/[0.06]"
          >
            <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan/20 blur-3xl transition group-hover:bg-cyan/30" />
            <span className="relative block text-xs uppercase tracking-[0.25em] text-cyan">
              Entrar
            </span>
            <span className="relative mt-4 block font-[family-name:var(--font-syne)] text-3xl font-bold text-white sm:text-4xl">
              Agencia
              <br />
              Streamersfederation
            </span>
            <span className="relative mt-4 block text-sm text-text-muted transition group-hover:text-white/80">
              Abrir panel Backstage →
            </span>
          </Link>

          <Link
            href={agencyPath(AGENCIES.elarbol.slug, "/login")}
            className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10 transition duration-300 hover:border-rose-400/40 hover:bg-white/[0.06]"
          >
            <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl transition group-hover:bg-rose-500/30" />
            <span className="relative block text-xs uppercase tracking-[0.25em] text-rose-300">
              Entrar
            </span>
            <span className="relative mt-4 block font-[family-name:var(--font-syne)] text-3xl font-bold text-white sm:text-4xl">
              Agencia
              <br />
              El Árbol
            </span>
            <span className="relative mt-4 block text-sm text-text-muted transition group-hover:text-white/80">
              Abrir panel Backstage →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
