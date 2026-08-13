# Backstage Agency — Gestión de Streamers TikTok LIVE

Panel web estilo **TikTok LIVE Backstage** para agencias: roster de creadores, métricas, calendario LIVE, tareas, campañas, finanzas y contratos.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (local) / Postgres (producción vía Supabase)
- NextAuth (login de managers)
- Supabase Storage (opcional, URLs de contratos)

## Inicio rápido (local)

Necesitas **Postgres** (Supabase gratis). Ver guía completa: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)

```bash
npm install
cp .env.example .env
# Pega DATABASE_URL y DIRECT_URL de Supabase
npx prisma generate
npx prisma db push
npm run dev
```

El **primer usuario** en `/register` queda como **admin**.

**No subas `.env`**. Bonos/KPI viven en **Firebase**.

Abre [http://localhost:3000](http://localhost:3000)

## Publicar en internet (Vercel)

GitHub Pages solo muestra el README. Para la app real sigue **[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**.


## Módulos

| Módulo | Qué hace |
|--------|----------|
| Overview | KPIs, top performers, alertas, tareas y próximos LIVE |
| Creadores | Alta con nombre, teléfono, nicho, fecha de incorporación + ficha completa |
| Data | Métricas diarias (diamantes, horas, peak, combates) + gráficos |
| LIVE Schedule | Calendario semanal y asistencia |
| Tareas | Cola del día por estado/prioridad |
| Campañas | Metas y progreso del roster |
| Finanzas | Liquidaciones y comisión de agencia |
| Contratos | Vigencia y enlace a PDF |

## Variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="cambia-este-secreto-largo-y-aleatorio"
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

## Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit: Backstage Agency panel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/agenciastreamersdatos.git
git push -u origin main
```

## Producción (Vercel + Supabase)

Los datos **no** se guardan dentro de GitHub (no es una base de datos). El código va en GitHub; los datos viven en Supabase Postgres.

1. Crea un proyecto en [Supabase](https://supabase.com)
2. Copia el connection string **Postgres** (Settings → Database)
3. En `prisma/schema.prisma` cambia:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Actualiza `.env` / variables de Vercel:
   ```env
   DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
   NEXTAUTH_URL="https://tu-app.vercel.app"
   NEXTAUTH_SECRET="secreto-largo"
   ```
5. Conecta el repo a [Vercel](https://vercel.com), añade las variables y despliega
6. Tras el deploy, genera tablas y seed:
   ```bash
   npx prisma db push
   npm run db:seed
   ```
   (o ejecuta esos comandos contra la `DATABASE_URL` de producción)

## Scripts útiles

```bash
npm run dev        # desarrollo
npm run db:setup   # crear tablas + datos demo
npm run db:seed    # solo seed
npm run build      # build producción
```

## Notas

- El primer usuario registrado se crea como `admin`; los siguientes como `manager`.
- Export CSV de creadores disponible desde el listado.
- La sincronización automática con TikTok Backstage oficial no está incluida (requiere acceso de Creator Network).
