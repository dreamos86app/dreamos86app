import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppProvider } from "@/components/providers/app-provider";
import { AppearanceProvider } from "@/components/providers/appearance-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://dreamos86.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "DreamOS86 — AI-native software operating system",
    template: "%s · DreamOS86",
  },
  description:
    "DreamOS86 is the AI-native operating system for software creation. Describe what you want; an orchestration of frontier models architects, builds, and deploys it.",
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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon.png",
  },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "DreamOS86",
    title: "DreamOS86 — AI-native software operating system",
    description:
      "Describe the app you want. DreamOS86 orchestrates frontier AI to architect, build, and deploy it.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "DreamOS86 — AI-native software operating system",
    description:
      "Describe the app you want. DreamOS86 orchestrates frontier AI to architect, build, and deploy it.",
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
  alternates: { canonical: APP_URL },
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
            </AppearanceProvider>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
