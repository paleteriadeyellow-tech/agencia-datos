# Agencia Panel — Desktop (Electron)

App de **escritorio nativa** (no es la web metida en un `.exe`).  
Usa la **misma base de datos / APIs** del panel Next.js.

## Requisitos

1. Backend corriendo (`agencia datos`):
   ```bash
   npm run dev
   ```
   Por defecto en `http://127.0.0.1:3000`

2. En esta carpeta `desktop/`:
   ```bash
   npm install
   copy .env.example .env
   npm run dev
   ```

## Login

- Agencia + email + contraseña (igual que la web)
- Token desktop (`Bearer`) → `/api/panel/creators` respeta admin/manager

## Producción / Vercel

En login, cambia **Servidor API** a tu URL de Vercel, por ejemplo:

`https://tu-proyecto.vercel.app`

(El endpoint `/api/desktop/login` debe estar desplegado.)

## Siguiente

- Pantallas Diamantes, KPI, Campañas
- Instalador `.exe` con electron-builder
