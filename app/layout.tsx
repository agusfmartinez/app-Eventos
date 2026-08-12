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

/**
 * Resuelve el tema antes del primer pintado.
 *
 * Va como script bloqueante en el <head> a propósito: si el tema se aplicara
 * después de hidratar, la página aparecería un instante en claro y saltaría a
 * oscuro. Es corto justamente para que ese bloqueo sea imperceptible.
 *
 * Si falla —modo incógnito con almacenamiento bloqueado, por ejemplo— queda el
 * tema claro, que es un default seguro.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('tema');
  if (t !== 'dark' && t !== 'light') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
`.trim();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // El script de arriba escribe data-theme antes de que React hidrate.
      // Sin esto, React reporta el atributo como diferencia servidor/cliente.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
