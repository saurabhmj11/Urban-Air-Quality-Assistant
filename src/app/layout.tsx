import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BreathEasy — Urban Air Quality Assistant",
  description:
    "GenAI co-pilot that helps families beat severe winter smog with live AQI tracking, personalised low-emission routines and indoor air hacks.",
  keywords: [
    "air quality",
    "AQI",
    "winter smog",
    "GenAI",
    "family health",
    "low-emission routines",
    "indoor air",
  ],
  authors: [{ name: "BreathEasy" }],
  openGraph: {
    title: "BreathEasy — Urban Air Quality Assistant",
    description:
      "Live AQI, AI-generated smog routines and indoor air hacks for your family.",
    siteName: "BreathEasy",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#101615" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
