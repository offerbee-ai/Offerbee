import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";

// "Ledger" type system — serif titles, Public Sans UI/body, mono for figures.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const siteDescription =
  "OfferBee tracks every statement credit and benefit across your premium cards — so you use them before they reset, and know which annual fees are still worth it.";

// Resolve the canonical origin per deploy so og:image/og:url stay on the
// domain being previewed (Netlify: CONTEXT/URL/DEPLOY_PRIME_URL; Vercel: VERCEL_URL).
const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.CONTEXT === "production"
    ? process.env.URL
    : process.env.DEPLOY_PRIME_URL) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "https://offerbee.ai";
// NEXT_PUBLIC_SITE_URL may be set as a bare hostname; new URL() needs a scheme.
const siteUrl = rawSiteUrl.startsWith("http")
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "OfferBee — Your card perks, actually used.",
    template: "%s — OfferBee",
  },
  description: siteDescription,
  applicationName: "OfferBee",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "OfferBee",
    title: "OfferBee — Your card perks, actually used.",
    description: siteDescription,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OfferBee — track every statement credit and benefit across your premium cards.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OfferBee — Your card perks, actually used.",
    description: siteDescription,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={cn(
          sourceSerif.variable,
          publicSans.variable,
          ibmPlexMono.variable,
        )}
      >
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/app"
          signUpFallbackRedirectUrl="/welcome"
          afterSignOutUrl="/"
          appearance={{ variables: { colorPrimary: "#e8680e" } }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
