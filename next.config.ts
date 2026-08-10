import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para la imagen Docker de producción: deja en .next/standalone
  // solo el server y las dependencias que realmente se usan (~150 MB en vez
  // de arrastrar todo node_modules).
  output: "standalone",

  // argon2 es un binario nativo: no se puede empaquetar, tiene que quedar
  // como require externo del lado del servidor.
  serverExternalPackages: ["@node-rs/argon2"],
};

export default nextConfig;
