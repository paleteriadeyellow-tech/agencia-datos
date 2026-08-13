# Desplegar en Vercel (guía)

GitHub Pages **no** corre esta app. Usa **Vercel**.

**Todo se guarda en Supabase (Postgres):** usuarios, creadores, liquidaciones/pagos, Bonos, KPI, tareas, campañas, diamantes. Ya no se usa Firebase para datos.

## 1) Crear base Postgres (Supabase, gratis)

1. Entra a https://supabase.com → **New project**
2. Anota la contraseña de la base
3. Ve a **Project Settings → Database → Connection string**
4. Copia:
   - **URI** del pooler (puerto **6543**, Transaction) → será `DATABASE_URL`
   - **URI** directa (puerto **5432**) → será `DIRECT_URL`
5. En ambas, reemplaza `[YOUR-PASSWORD]` por tu contraseña

## 2) Subir el código a GitHub

Desde la carpeta del repo (`agencia datos`):

```powershell
cd "C:\Users\Admin\Desktop\agenciastreamersdatos\agencia datos"
git add -A
git commit -m "Bonos y KPI en Supabase (sin Firebase)"
git push
```

## 3) Crear proyecto en Vercel

1. https://vercel.com → login con **GitHub**
2. **Add New… → Project** → importa **`agencia-datos`**
3. Environment Variables:

| Name | Value |
|------|--------|
| `DATABASE_URL` | pooler Supabase (6543) |
| `DIRECT_URL` | directa Supabase (5432) |
| `NEXTAUTH_SECRET` | secreto largo (https://generate-secret.vercel.app/32) |
| `NEXTAUTH_URL` | `https://TU-APP.vercel.app` (ajusta tras el primer deploy) |

4. **Deploy**

## 4) Después del primer deploy

1. Actualiza `NEXTAUTH_URL` con la URL real
2. **Redeploy**
3. En local (con las URLs de Postgres en `.env`):

```powershell
npx prisma db push
npx tsx prisma/assign-agency.ts
```

4. Abre la portada `/` → elige agencia → `/register` crea el primer admin **de esa agencia**

**Multi-agencia:** Streamersfederation y El Árbol comparten la misma app; los datos no se mezclan (`agencySlug`).

## Local

Usa las mismas `DATABASE_URL` / `DIRECT_URL` de Supabase en `.env`, luego:

```powershell
npm install
npx prisma generate
npx prisma db push
npm run dev
```
