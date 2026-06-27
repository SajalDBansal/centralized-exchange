import { Geist_Mono, Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils";
import { Toaster } from "@workspace/ui/components/sonner";
import type { Metadata, Viewport } from "next";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "NexaX",
  title: {
    default: "NexaX | Spot & Perpetual Crypto Trading",
    template: "%s | NexaX",
  },
  description: "Explore live crypto markets and trade spot and perpetual pairs with real-time charts, order books, and professional trading tools.",
  keywords: ["crypto exchange", "spot trading", "perpetual futures", "crypto markets", "Bitcoin", "Ethereum", "NexaX"],
  authors: [{ name: "NexaX" }],
  creator: "NexaX",
  publisher: "NexaX",
  category: "finance",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "NexaX | Spot & Perpetual Crypto Trading",
    description: "Live crypto markets, real-time order books, and professional spot and perpetual trading tools.",
    url: "/",
    siteName: "NexaX",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NexaX | Spot & Perpetual Crypto Trading",
    description: "Live crypto markets and professional spot and perpetual trading tools.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17181c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
