# Agencia Panel — Desktop

Abre el **panel web completo** en una ventana de escritorio  
(mismas pestañas, mismos datos, mismo login).

## Arranque

### Opción A — Local (recomendado mientras desarrollas)

1. Backend:
```bash
cd "agencia datos"
npm run dev
```

2. App PC:
```bash
cd "agencia datos/desktop"
npm run dev
```

En `config.json` deja `"useDev": true`.

### Opción B — Vercel (producción)

En `config.json`:
```json
{
  "url": "https://agencia-datos.vercel.app",
  "devUrl": "http://127.0.0.1:3000",
  "useDev": false
}
```

Luego:
```bash
npm run dev
```

## Qué incluye

Todo lo de la web: Overview, Creadores, Diamantes, Livecoins, KPI, WhatsApp,
Tareas, Campañas, Calendario, Reclutamiento, Finanzas, Bonos, Contratos,
Managers, etc. (según rol admin/manager).
