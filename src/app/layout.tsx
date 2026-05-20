import type { Metadata, Viewport } from "next";

import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";

import { AppProvider } from "@/components/providers/app-provider";

import { AppearanceProvider } from "@/components/providers/appearance-provider";

import { Toaster } from "@/components/ui/toaster";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

import { getSiteUrl } from "@/lib/app-url";



export const dynamic = "force-dynamic";



const geistSans = Geist({

  variable: "--font-geist-sans",

  subsets: ["latin"],

});



const geistMono = Geist_Mono({

  variable: "--font-geist-mono",

  subsets: ["latin"],

});



const SITE_URL = getSiteUrl();

const ICON_V = "12";



export const metadata: Metadata = {

  metadataBase: new URL(SITE_URL),

  title: {

    default: "DreamOS86",

    template: "%s | DreamOS86",

  },

  description:

    "DreamOS86 is the AI-native platform for building software. Describe what you want — frontier AI architects, builds, and deploys it in minutes.",

  applicationName: "DreamOS86",

  keywords: [

    "AI",

    "app builder",

    "AI operating system",

    "code generation",

    "Next.js",

    "Supabase",

    "Vercel",

  ],

  authors: [{ name: "DreamOS86" }],

  creator: "DreamOS86",

  publisher: "DreamOS86",

  manifest: `/manifest.webmanifest?v=${ICON_V}`,

  icons: {
    icon: [
      { url: `/favicon.ico?v=${ICON_V}` },
      { url: `/brand/dreamos86-icon.png?v=${ICON_V}`, sizes: "512x512", type: "image/png" },
      { url: `/favicon-32x32.png?v=${ICON_V}`, sizes: "32x32", type: "image/png" },
      { url: `/favicon-192x192.png?v=${ICON_V}`, sizes: "192x192", type: "image/png" },
      { url: `/icon.png?v=${ICON_V}`, sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: `/apple-touch-icon.png?v=${ICON_V}`, sizes: "180x180", type: "image/png" },
    ],
    shortcut: [`/favicon.ico?v=${ICON_V}`],
  },

  formatDetection: { telephone: false, email: false, address: false },

  openGraph: {

    type: "website",

    url: SITE_URL,

    siteName: "DreamOS86",

    title: "DreamOS86",

    description:

      "Describe the app you want. DreamOS86 uses frontier AI to architect, build, and deploy it in minutes.",

    locale: "en_US",

  },

  twitter: {

    card: "summary_large_image",

    title: "DreamOS86",

    description:

      "Describe the app you want. DreamOS86 uses frontier AI to architect, build, and deploy it in minutes.",

  },

  robots: {

    index: true,

    follow: true,

    googleBot: {

      index: true,

      follow: true,

      "max-image-preview": "large",

      "max-snippet": -1,

    },

  },

  alternates: { canonical: SITE_URL },

};



export const viewport: Viewport = {

  themeColor: [

    { media: "(prefers-color-scheme: light)", color: "#f4f7fd" },

    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },

  ],

  colorScheme: "light dark",

  width: "device-width",

  initialScale: 1,

  maximumScale: 5,

};



export default function RootLayout({

  children,

}: Readonly<{

  children: React.ReactNode;

}>) {

  return (

    <html

      lang="en"

      className={`${geistSans.variable} ${geistMono.variable} h-full`}

      suppressHydrationWarning

    >

      <body className="min-h-full" suppressHydrationWarning>

        <ThemeProvider>

          <AppProvider>

            <AppearanceProvider>

              {children}

              <Toaster />
              <SpeedInsights />

            </AppearanceProvider>

          </AppProvider>

        </ThemeProvider>

      </body>

    </html>

  );

}

