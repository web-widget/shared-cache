/**
 * Append `cache-control` headers.
 */
export function cacheControl(
  headers: Headers,
  cacheControl: string | string[]
) {
  const directives = Array.isArray(cacheControl)
    ? cacheControl
    : cacheControl.split(',');

  appendCacheControl(headers, directives);
}

function appendCacheControl(headers: Headers, directives: string[]) {
  const existingDirectives =
    headers
      .get('cache-control')
      ?.split(',')
      .map((d) => d.trim().split('=', 1)[0]) ?? [];
  for (const directive of directives) {
    const [_name, value] = directive.trim().split('=', 2);
    const name = _name.toLowerCase();
    if (!existingDirectives.includes(name)) {
      headers.append('cache-control', `${name}${value ? `=${value}` : ''}`);
    }
  }
}
