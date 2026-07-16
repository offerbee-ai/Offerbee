import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Request a Clerk avatar at a display-appropriate resolution. Clerk's
 * `user.imageUrl` defaults to a small render, so at retina densities a tiny
 * avatar box upscales and looks blurry. `img.clerk.com` honors a `width` query
 * param, so ask for ~3× the CSS size (capped). Falls back to the original URL
 * if it isn't a parseable http(s) URL.
 */
export function clerkImageUrl(url: string, cssPx: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(Math.min(cssPx * 3, 512)));
    return u.toString();
  } catch {
    return url;
  }
}
