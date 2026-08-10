import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: "Control de Acceso — Salón de Eventos",
  description: "Gestión de eventos, invitados y control de acceso por QR.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El scanner se opera con una mano. Permitimos zoom por accesibilidad pero
  // arrancamos siempre al 100%.
  maximumScale: 5,
  themeColor: "#6d28d9",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
