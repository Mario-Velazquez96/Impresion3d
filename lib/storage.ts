import "server-only";

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-only Storage helpers for print photos (06_print_inventory). All ops run
 * against the PRIVATE `print-photos` bucket using the per-request authenticated
 * Supabase client (the bucket's RLS policies gate every operation to the
 * authenticated role — defense-in-depth alongside the server-layer auth guards).
 *
 * We NEVER return or store a public URL: reads go exclusively through
 * `createSignedUrl` (TTL `SIGNED_URL_TTL_SECONDS`). Object keys are unguessable
 * (uuid-based), so a leaked key is scoped to a single object.
 */

export const PRINT_PHOTOS_BUCKET = "print-photos";

// Gate decision: signed URLs live for 1 hour. Centralized so it is easy to change.
export const SIGNED_URL_TTL_SECONDS = 3600;

/** A fresh, unguessable object key for a print photo, preserving the extension. */
export function buildPhotoKey(originalName?: string): string {
  const ext = extensionFor(originalName);
  return `prints/${randomUUID()}${ext}`;
}

/** Derive a safe lowercase extension (incl. dot) from a filename, or "". */
function extensionFor(originalName?: string): string {
  if (!originalName) return "";
  const dot = originalName.lastIndexOf(".");
  if (dot < 0 || dot === originalName.length - 1) return "";
  const ext = originalName.slice(dot + 1).toLowerCase();
  // Only allow simple alphanumeric extensions; otherwise drop it.
  return /^[a-z0-9]+$/.test(ext) ? `.${ext}` : "";
}

/**
 * Upload a new photo and return its Storage object key (R5). The key is generated
 * here (unguessable); the caller persists it in `Print.photoPath`. Throws on a
 * Storage error so the action can abort before writing the DB row.
 */
export async function uploadPhoto(file: File): Promise<string> {
  const supabase = await createClient();
  const key = buildPhotoKey(file.name);

  const { error } = await supabase.storage
    .from(PRINT_PHOTOS_BUCKET)
    .upload(key, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return key;
}

/**
 * Replace a print's photo (R6): upload the new object, then remove the previous
 * one (best-effort). Returns the new key. Uploading first means a failure leaves
 * the old photo intact (no orphaned print row pointing at a missing object).
 */
export async function replacePhoto(
  file: File,
  previousKey: string | null,
): Promise<string> {
  const newKey = await uploadPhoto(file);
  if (previousKey) {
    await removePhoto(previousKey);
  }
  return newKey;
}

/**
 * Remove a Storage object by key (R7). Best-effort: a missing object is not an
 * error worth failing the delete over (the DB row is already gone / going).
 */
export async function removePhoto(key: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from(PRINT_PHOTOS_BUCKET)
    .remove([key]);
  if (error) {
    throw new Error(`Photo removal failed: ${error.message}`);
  }
}

/**
 * Create a short-lived signed URL for an object key (R4), valid for
 * `SIGNED_URL_TTL_SECONDS`. Generated at render time and never stored. Returns
 * null when the key is null or signing fails, so the UI can fall back to a
 * placeholder rather than crash.
 */
export async function createSignedUrl(
  key: string | null,
): Promise<string | null> {
  if (!key) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PRINT_PHOTOS_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
