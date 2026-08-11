/**
 * Smoke test del flujo de autenticación y autorización.
 *
 * Requiere el server de desarrollo corriendo (`npm run dev`) y la base
 * levantada con el admin del seed.
 *
 *   npm run test:smoke
 *
 * No reemplaza los tests de autorización de la Fase 7: verifica el camino
 * feliz y las dos garantías que más importan — que no se entra sin sesión y
 * que desactivar un usuario corta el acceso en el request siguiente.
 */
import { execSync } from "node:child_process";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@salon.local";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

const jar = new Map();

function saveCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    ...opts,
    // Va DESPUÉS del spread: si no, opts.headers pisa la cookie entera.
    headers: { cookie: cookieHeader(), ...(opts.headers ?? {}) },
  });
  saveCookies(res);
  return res;
}

function postForm(path, fields) {
  return req(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

const sql = (query) =>
  execSync(`docker exec -i eventos_db psql -U eventos -d eventos -t -c "${query}"`, {
    encoding: "utf8",
  });

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const locationOf = (res) => res.headers.get("location") ?? "";

// ------------------------------------------------------------

let res = await req("/panel");
check(
  "ruta protegida sin sesión redirige al login",
  res.status === 307 && locationOf(res).includes("/login"),
  `status=${res.status} location=${locationOf(res)}`,
);

res = await req("/api/auth/csrf");
const { csrfToken } = await res.json();
check("obtiene csrfToken", Boolean(csrfToken));

res = await postForm("/api/auth/callback/credentials", {
  csrfToken,
  email: EMAIL,
  password: "contrasena-incorrecta",
});
check(
  "contraseña incorrecta es rechazada",
  locationOf(res).includes("error") || locationOf(res).includes("/login"),
  `location=${locationOf(res)}`,
);

res = await postForm("/api/auth/callback/credentials", {
  csrfToken,
  email: EMAIL,
  password: PASSWORD,
});
check(
  "login correcto entrega cookie de sesión",
  [...jar.keys()].some((k) => k.includes("session-token")),
  `cookies=${[...jar.keys()]}`,
);

res = await req("/panel");
check(
  "el panel responde con sesión válida",
  res.status === 200,
  `status=${res.status}`,
);

res = await req("/");
check(
  "la raíz enruta al panel según el rol",
  locationOf(res).includes("/panel"),
  `location=${locationOf(res)}`,
);

// La garantía que justifica consultar la base en cada request protegido.
sql(`UPDATE users SET active = false WHERE email = '${EMAIL}'`);
res = await req("/panel");
const blocked = res.status === 307 && locationOf(res).includes("/login");
sql(`UPDATE users SET active = true WHERE email = '${EMAIL}'`);

check(
  "desactivar al usuario corta el acceso con la MISMA cookie",
  blocked,
  `status=${res.status} location=${locationOf(res)}`,
);

res = await req("/panel");
check(
  "reactivarlo restablece el acceso",
  res.status === 200,
  `status=${res.status}`,
);

// ------------------------------------------------------------

for (const r of results) {
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  << ${r.detail}`}`,
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log(failed === 0 ? "\nTodo OK" : `\n${failed} fallaron`);
process.exit(failed === 0 ? 0 : 1);
