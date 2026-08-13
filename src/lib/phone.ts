/** Utilidades de teléfono / WhatsApp (LatAm + ES/US). */

type CountryRule = {
  code: string;
  iso: string;
  name: string;
  /** longitudes típicas del número nacional (sin código de país) */
  lengths: number[];
};

/** Códigos más largos primero para el match. */
export const PHONE_COUNTRIES: CountryRule[] = [
  { code: "593", iso: "EC", name: "Ecuador", lengths: [9] },
  { code: "502", iso: "GT", name: "Guatemala", lengths: [8] },
  { code: "503", iso: "SV", name: "El Salvador", lengths: [8] },
  { code: "504", iso: "HN", name: "Honduras", lengths: [8] },
  { code: "505", iso: "NI", name: "Nicaragua", lengths: [8] },
  { code: "506", iso: "CR", name: "Costa Rica", lengths: [8] },
  { code: "507", iso: "PA", name: "Panamá", lengths: [8] },
  { code: "591", iso: "BO", name: "Bolivia", lengths: [8] },
  { code: "595", iso: "PY", name: "Paraguay", lengths: [9] },
  { code: "598", iso: "UY", name: "Uruguay", lengths: [8] },
  { code: "52", iso: "MX", name: "México", lengths: [10] },
  { code: "57", iso: "CO", name: "Colombia", lengths: [10] },
  { code: "54", iso: "AR", name: "Argentina", lengths: [10, 11] },
  { code: "51", iso: "PE", name: "Perú", lengths: [9] },
  { code: "56", iso: "CL", name: "Chile", lengths: [9] },
  { code: "58", iso: "VE", name: "Venezuela", lengths: [10] },
  { code: "55", iso: "BR", name: "Brasil", lengths: [10, 11] },
  { code: "34", iso: "ES", name: "España", lengths: [9] },
  { code: "1", iso: "US", name: "EE.UU./Canadá", lengths: [10] },
];

const DEFAULT_ISO = "MX";

function digitsOnly(raw: string) {
  return raw.replace(/\D/g, "");
}

function isPlaceholderPhone(raw: string) {
  const s = raw.trim().toLowerCase();
  return (
    !s ||
    s.startsWith("tiktok:") ||
    s.startsWith("@") ||
    /^https?:\/\//i.test(s)
  );
}

function countryByIso(iso: string) {
  return (
    PHONE_COUNTRIES.find((c) => c.iso === iso.toUpperCase()) ??
    PHONE_COUNTRIES.find((c) => c.iso === DEFAULT_ISO)!
  );
}

function matchCountryPrefix(digits: string): CountryRule | null {
  for (const c of PHONE_COUNTRIES) {
    if (!digits.startsWith(c.code)) continue;
    const national = digits.slice(c.code.length);
    // MX móvil antiguo: 52 + 1 + 10 dígitos
    if (c.iso === "MX" && national.startsWith("1") && national.length === 11) {
      return c;
    }
    if (c.lengths.includes(national.length)) return c;
    // Prefijo claro aunque la longitud no sea exacta (ya trae +código)
    if (national.length >= Math.min(...c.lengths)) return c;
  }
  return null;
}

export type NormalizedPhone = {
  e164Digits: string; // solo dígitos con código país, para wa.me
  display: string; // +52 …
  iso: string;
  countryName: string;
};

/**
 * Detecta código de país y normaliza el número.
 * Default: México (+52) si parece número nacional de 10 dígitos.
 */
export function normalizePhone(
  raw: string,
  hintIso?: string | null
): NormalizedPhone | null {
  if (isPlaceholderPhone(raw)) return null;

  let s = raw.trim();
  if (s.startsWith("00")) s = `+${s.slice(2)}`;

  let digits = digitsOnly(s);
  if (digits.length < 8) return null;

  // Quitar 0 inicial nacional (p. ej. 055…)
  if (!s.startsWith("+") && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  let country = matchCountryPrefix(digits);

  if (!country) {
    const fallback = countryByIso(hintIso || DEFAULT_ISO);
    // Si ya es solo nacional, anteponer código
    if (fallback.lengths.includes(digits.length)) {
      country = fallback;
      digits = fallback.code + digits;
    } else if (
      fallback.iso === "MX" &&
      digits.length === 11 &&
      digits.startsWith("1")
    ) {
      // 1 + 10 dígitos → móvil MX legacy
      country = fallback;
      digits = "52" + digits;
    } else if (digits.length === 9 && /^[679]/.test(digits)) {
      // Móvil España sin +34
      country = countryByIso("ES");
      digits = "34" + digits;
    } else if (digits.length >= 11) {
      // Intentar de nuevo por si traía código sin +
      country = matchCountryPrefix(digits);
    }
  }

  if (!country) {
    // Último recurso: asumir default si hay suficientes dígitos
    const fallback = countryByIso(hintIso || DEFAULT_ISO);
    if (digits.length >= Math.min(...fallback.lengths)) {
      if (!digits.startsWith(fallback.code)) {
        digits = fallback.code + digits.slice(-Math.max(...fallback.lengths));
      }
      country = fallback;
    } else {
      return null;
    }
  }

  // Normalizar MX: 521XXXXXXXXXX → 52XXXXXXXXXX (WhatsApp)
  if (
    country.iso === "MX" &&
    digits.startsWith("521") &&
    digits.length === 13
  ) {
    digits = "52" + digits.slice(3);
  }

  const national = digits.slice(country.code.length);
  const display = `+${country.code} ${national}`.trim();

  return {
    e164Digits: digits,
    display,
    iso: country.iso,
    countryName: country.name,
  };
}

export function whatsappUrl(raw: string, hintIso?: string | null) {
  const n = normalizePhone(raw, hintIso);
  if (!n) return null;
  return `https://wa.me/${n.e164Digits}`;
}

export function formatPhoneInputValue(
  raw: string,
  hintIso?: string | null
): string {
  const n = normalizePhone(raw, hintIso);
  return n ? n.display : raw.trim();
}
