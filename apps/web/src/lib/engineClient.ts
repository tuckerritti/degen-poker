const baseUrl = (process.env.NEXT_PUBLIC_ENGINE_URL ?? "").replace(/\/+$/, "");

export function getEngineUrl() {
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_ENGINE_URL is not set. Please set it to your engine base URL (e.g. https://engine.example.com).",
    );
  }
  return baseUrl;
}

export async function engineFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getEngineUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, init);
}

export function safeEngineUrl() {
  return baseUrl;
}
