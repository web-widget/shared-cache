/** Computes a standard SHA-1 hex digest (40 characters). */
export const sha1 = async (data: string): Promise<string> => {
  const sourceBuffer = new TextEncoder().encode(String(data));

  if (!crypto || !crypto.subtle) {
    throw new Error('SHA-1 is not supported');
  }

  const buffer = await crypto.subtle.digest('SHA-1', sourceBuffer);
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x) => ('00' + x.toString(16)).slice(-2))
    .join('');
};
