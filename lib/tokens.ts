import { randomBytes, randomInt } from "node:crypto";

/**
 * Alfabeto sin caracteres ambiguos: no están 0/O ni 1/I/L.
 * Heredado del prototipo — es el detalle que hace que un código se pueda
 * dictar por teléfono o tipear a mano sin equivocarse.
 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Token de la invitación: lo único que viaja dentro del QR.
 *
 * 32 bytes de randomBytes → 43 chars base64url. Nunca Math.random(), que es
 * predecible, ni IDs incrementales, que se pueden enumerar.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Código corto legible, respaldo para cuando el QR no se puede escanear
 * (pantalla rota, brillo bajo, captura comprimida).
 *
 * No es un mecanismo de seguridad: 8 chars de este alfabeto son ~40 bits, y
 * además se valida siempre junto al evento. La unicidad la garantiza el
 * índice (event_id, short_code) de la base.
 */
export function generateShortCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }
  return out;
}
