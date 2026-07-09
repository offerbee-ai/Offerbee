import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only the product area is protected. The marketing site, legal pages, and the
// sign-in/up routes stay public (protecting sign-in would create a redirect loop).
const isProtectedRoute = createRouteMatcher(["/app(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|map)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
