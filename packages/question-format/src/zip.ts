import JSZip from 'jszip';

/**
 * Uploaded .xlsx/.docx files are untrusted zip archives. Limits (all enforced while inflating, so a
 * zip bomb is stopped after `maxTotal` bytes, not after it has filled memory):
 */
export const ZIP_LIMITS = { maxEntries: 500, maxEntry: 64 * 1024 * 1024, maxTotal: 160 * 1024 * 1024 };

export class FormatError extends Error {}

interface StreamHelper {
  on(ev: 'data', fn: (c: Uint8Array) => void): StreamHelper;
  on(ev: 'error', fn: (e: Error) => void): StreamHelper;
  on(ev: 'end', fn: () => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
}

function inflate(file: JSZip.JSZipObject, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let n = 0;
    let failed = false;
    // `internalStream` (documented in JSZip 3, missing from its typings) inflates in small chunks.
    const s = (file as unknown as { internalStream(t: 'uint8array'): StreamHelper }).internalStream('uint8array');
    s.on('data', (c: Uint8Array) => {
      if (failed) return;
      n += c.length;
      if (n > limit) {
        failed = true;
        s.pause();
        reject(new FormatError(`${file.name} is larger than ${Math.round(limit / 1048576)} MB when unpacked`));
        return;
      }
      chunks.push(c);
    })
      .on('error', (e: Error) => {
        if (!failed) reject(new FormatError(`damaged file: ${e.message}`));
      })
      .on('end', () => {
        if (!failed) resolve(Buffer.concat(chunks));
      });
    s.resume();
  });
}

/** Read the XML parts we need from an OOXML package; rejects DTDs (no entity expansion, no XXE). */
export async function openPackage(buf: Buffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new FormatError('not an .xlsx/.docx file (not a zip archive)');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf, { checkCRC32: true });
  } catch (e) {
    throw new FormatError(`damaged file: ${(e as Error).message}`);
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);
  if (files.length > ZIP_LIMITS.maxEntries) throw new FormatError(`too many parts in the archive (${files.length})`);
  const out = new Map<string, string>();
  let total = 0;
  for (const f of files) {
    if (!wanted(f.name)) continue;
    const data = await inflate(f, Math.min(ZIP_LIMITS.maxEntry, ZIP_LIMITS.maxTotal - total));
    total += data.length;
    const text = data.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new FormatError(`${f.name}: DTDs are not allowed`);
    out.set(f.name, text);
  }
  return out;
}

export async function writePackage(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(parts)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
