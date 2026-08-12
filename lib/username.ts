/**
 * Nombre de usuario para iniciar sesión.
 *
 * Regla: inicial del nombre + apellido, en mayúsculas.
 * `Agustín Martínez` → `AMARTINEZ`
 *
 * Se quitan acentos y cualquier cosa que no sea letra o número: el username se
 * tipea en la pantalla de login, muchas veces en el teclado de un celular, y
 * un apellido con tilde o guion sería una fuente segura de errores.
 */

export function buildUsername(firstName: string, lastName: string): string {
  const initial = stripDiacritics(firstName.trim()).slice(0, 1);
  const surname = stripDiacritics(lastName.trim());

  const candidate = `${initial}${surname}`
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  return candidate || "USUARIO";
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resuelve las repeticiones agregando un número.
 *
 * Dos "Martínez" con nombres que empiezan igual dan el mismo candidato. En vez
 * de fallar y pedirle al admin que invente algo, se numeran: `AMARTINEZ`,
 * `AMARTINEZ2`, `AMARTINEZ3`.
 */
export function resolveUsernameCollision(
  candidate: string,
  taken: Set<string>,
): string {
  if (!taken.has(candidate)) return candidate;

  for (let n = 2; n < 1000; n++) {
    const next = `${candidate}${n}`;
    if (!taken.has(next)) return next;
  }

  throw new Error(`No se pudo generar un usuario único para ${candidate}`);
}
