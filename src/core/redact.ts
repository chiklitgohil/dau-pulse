/**
 * Strip personal data before text leaves our servers (LLM / embedding calls).
 * The original text is still stored for staff; only the copy sent to the model is redacted.
 */
export function redactPersonalData(text: string, opts: { reporterName?: string | null } = {}): string {
  let out = text
    // Emails
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    // Phone numbers: +91 98765 43210, 098765-43210, 9876543210 …
    .replace(/(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,11}\d/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[PHONE]' : m))
    // Student / staff IDs: long digit runs (8+), e.g. 202101234. Room numbers (≤4 digits) are kept.
    .replace(/\b\d{8,}\b/g, '[ID]');

  const name = opts.reporterName?.trim();
  if (name) {
    for (const part of name.split(/\s+/).filter((p) => p.length >= 3)) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), '[NAME]');
    }
  }
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
