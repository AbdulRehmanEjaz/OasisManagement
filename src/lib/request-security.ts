export function isSameOrigin(request: { headers: Headers; url: string }) {
  try {
    const value = request.headers.get("origin");
    if (!value) return false;
    const origin = new URL(value),
      target = new URL(request.url);
    return (
      origin.host === (request.headers.get("host") || target.host) &&
      origin.protocol === target.protocol
    );
  } catch {
    return false;
  }
}
