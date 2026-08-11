/**
 * Generación de CSV pensada para que abra bien en Excel en español.
 *
 * Dos decisiones que parecen menores y no lo son:
 *
 *  - **Separador `;`**. Excel en configuración regional española usa punto y
 *    coma como separador de lista. Con comas mete todo en una sola columna, y
 *    el usuario del salón no va a saber por qué.
 *  - **BOM al inicio**. Sin él, Excel interpreta el archivo como ANSI y los
 *    acentos salen rotos: "Martín" se convierte en "MartÃ­n".
 */

const SEPARATOR = ";";
const BOM = "\uFEFF";

/**
 * Neutraliza la inyección de fórmulas.
 *
 * Excel ejecuta como fórmula cualquier celda que empiece con = + - @ o con
 * tabulación. Un invitado cargado como `=HYPERLINK("http://malo","click")`
 * se convertiría en un enlace activo al abrir el archivo. Los nombres los
 * escribe gente, así que hay que tratarlos como texto no confiable.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = neutralize(String(value));

  // Comillas dobles, separador o saltos de línea obligan a entrecomillar,
  // duplicando las comillas internas.
  if (text.includes('"') || text.includes(SEPARATOR) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCsv(
  headers: string[],
  rows: (unknown[])[],
): string {
  const lines = [
    headers.map(escapeCell).join(SEPARATOR),
    ...rows.map((row) => row.map(escapeCell).join(SEPARATOR)),
  ];

  // CRLF: es lo que espera Excel en Windows.
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Nombre de archivo seguro, sin acentos ni caracteres que rompan la cabecera. */
export function csvFileName(parts: string[]): string {
  const slug = parts
    .join("-")
    .normalize("NFD")
    // Marcas diacríticas: "Martín" → "Martin"
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${slug || "export"}.csv`;
}

export function csvResponse(content: string, fileName: string): Response {
  return new Response(content, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      // Un export siempre tiene que traer datos frescos.
      "cache-control": "no-store",
    },
  });
}
