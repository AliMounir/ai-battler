import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "https://arena-model-lab.sites.openai.com";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: "Arena — Model selection, measured",
    description:
      "Compare DeepInfra models under identical prompts, measure quality, speed, token usage and cost, and search the complete model catalog.",
    applicationName: "Arena",
    category: "developer tools",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      siteName: "Arena",
      title: "Arena — Model selection, measured",
      description:
        "A precision lab for comparing DeepInfra models on output quality, speed, token usage and cost.",
      images: [
        {
          url: socialImage,
          width: 1792,
          height: 1024,
          alt: "Arena model comparison lab",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Arena — Model selection, measured",
      description:
        "Compare DeepInfra models under the same prompt and choose with evidence.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
