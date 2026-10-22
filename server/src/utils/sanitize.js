import sanitizeHtml from 'sanitize-html';

/*
  Strips all HTML/script content from user-submitted free text
  (reviews, contact messages, names, etc). React already escapes
  output by default, so this is defense-in-depth for anywhere that
  content might end up in an email template (which uses raw HTML
  strings, NOT React) or a future admin view that isn't as careful.
*/
export function sanitizeText(input, maxLength = 2000) {
  if (input === null || input === undefined) return '';
  const clean = sanitizeHtml(String(input), { allowedTags: [], allowedAttributes: {} });
  return clean.trim().slice(0, maxLength);
}
