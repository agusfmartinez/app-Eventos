import QRCode from "qrcode";

/**
 * El QR lleva únicamente la URL pública de la invitación, que a su vez lleva
 * solo el token. Nada de nombre, teléfono ni datos del invitado: si alguien
 * fotografía el QR, no obtiene información personal.
 */

const OPTIONS = {
  // M tolera ~15% de daño. Suficiente para una pantalla con brillo bajo o una
  // captura recomprimida por WhatsApp, sin agrandar tanto el código como para
  // que los módulos queden chicos al escanear.
  errorCorrectionLevel: "M" as const,
  margin: 2,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** PNG en data URI. Se usa en la imagen de la invitación (Satori necesita img). */
export function qrPngDataUrl(text: string, width = 512): Promise<string> {
  return QRCode.toDataURL(text, { ...OPTIONS, width });
}

/** SVG inline. Se usa en la página web: escala sin pixelarse y pesa menos. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTIONS, type: "svg" });
}
