import { getSupabaseAdmin } from "@/lib/supabase";

export const EVIDENCE_BUCKET = "task-evidence";

let bucketReady = false;

/** Cliente de almacenamiento con el bucket privado de evidencias creado (una vez por instancia). */
export async function evidenceStorage() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  if (!bucketReady) {
    const { error } = await supabase.storage.createBucket(EVIDENCE_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    // Si ya existe, está bien
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.error("[evidence] no se pudo crear el bucket:", error.message);
      return null;
    }
    bucketReady = true;
  }
  return supabase.storage.from(EVIDENCE_BUCKET);
}
