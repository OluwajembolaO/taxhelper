// Attachment validation.
//
// WHY THIS FILE EXISTS: attachments are the one place untrusted bytes enter the
// app. A `blob:` URL inherits the origin of the page that created it, so opening
// an uploaded SVG or HTML file in a tab runs its scripts AS TaxHelper — able to
// read the auth session out of localStorage. Declared MIME types are attacker-
// controlled and cannot be trusted, so every file is checked by magic bytes and
// anything not on the raster/PDF allowlist is rejected before it is ever stored.

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, matching the storage bucket

/** Allowlist, never a blocklist. SVG is deliberately absent — it is scriptable. */
const SIGNATURES = [
  { type: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

const matchesAt = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

const ascii = (buf, offset, len) => String.fromCharCode(...buf.slice(offset, offset + len));

// RIFF....WEBP and the ISO-BMFF box used by HEIC need a windowed check.
function sniff(buf) {
  for (const sig of SIGNATURES) if (matchesAt(buf, sig.bytes)) return sig;
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    return { type: 'image/webp', ext: 'webp' };
  }
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { type: 'image/heic', ext: 'heic' };
    }
  }
  return null;
}

/** The `accept` attribute — a hint for the file picker, never the security check. */
export const ACCEPT =
  '.png,.jpg,.jpeg,.webp,.heic,.pdf,image/png,image/jpeg,image/webp,image/heic,application/pdf';

/**
 * @returns {Promise<{ok: true, type, ext, name} | {ok: false, reason: string}>}
 */
export async function validateFile(file) {
  if (!file) return { ok: false, reason: 'No file selected.' };
  if (file.size === 0) return { ok: false, reason: `"${file.name}" is empty.` };
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB.`,
    };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sig = sniff(header);
  if (!sig) {
    return {
      ok: false,
      reason:
        `"${file.name}" is not a photo or PDF. Screenshots and camera photos work; ` +
        'SVG and other scriptable formats are blocked on purpose.',
    };
  }
  return { ok: true, type: sig.type, ext: sig.ext, name: sanitizeName(file.name, sig.ext) };
}

// Control characters (0x00–0x1F and 0x7F) as a character class.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/**
 * Filenames become storage paths and download names. Strip directory separators,
 * control characters, and leading dots so a name can never traverse or hide.
 */
export function sanitizeName(name, ext) {
  const base = String(name || 'attachment')
    .replace(CONTROL_CHARS, '')
    .replace(/[\\/]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
  const safe = base || `attachment.${ext}`;
  return /\.[a-z0-9]{2,5}$/i.test(safe) ? safe : `${safe}.${ext}`;
}
