import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para la imagen Docker de producción: deja en .next/standalone
  // solo el server y las dependencias que realmente se usan (~150 MB en vez
  // de arrastrar todo node_modules).
  output: "standalone",

  // argon2 es un binario nativo: no se puede empaquetar, tiene que quedar
  // como require externo del lado del servidor.
  serverExternalPackages: ["@node-rs/argon2"],

  /**
   * Solo afecta a `next dev`.
   *
   * El server de desarrollo rechaza con 403 los pedidos a /_next/* que llegan
   * desde un origen distinto al suyo. Sin esta lista, entrar desde el celular
   * por un túnel o por la IP de la LAN devuelve el HTML pero bloquea los
   * chunks de JavaScript: la página se ve, no hidrata, y los botones no hacen
   * nada — sin ningún error visible.
   *
   * Hace falta para probar el scanner en un teléfono real.
   */
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    // IP de la Wi-Fi, para cuando se prueba con `npm run dev:https`.
    "192.168.0.136",
  ],
};

export default nextConfig;
