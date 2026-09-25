/**
 * screenshot-test.js
 * ------------------------------------------------------
 * Automatiza: login + navegación por varias secciones + captura de pantalla.
 *
 * INSTALACIÓN (una sola vez, en tu proyecto o en una carpeta nueva):
 *   npm init -y
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * USO:
 *   node screenshot-test.js
 *
 * Las capturas se guardan en ./screenshots/
 * ------------------------------------------------------
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// IDs/tokens del evento de demo ("Boda Ferrari - Guzmán"), creado por
// test/seed-demo-event.ts (npx tsx --conditions=react-server test/seed-demo-event.ts).
// Correr ese script de nuevo genera un evento distinto: actualizar estos valores
// con el JSON que imprime.
const EVENT_ID = process.env.SCREENSHOT_EVENT_ID || 'f36137ef-1c9b-48ff-8947-e1638be15dc4';
const REG_TOKEN = process.env.SCREENSHOT_REG_TOKEN || '8L_L-CDm4bpKGGuDLUQqgwILzIZBSrTv35wnQtFpUy0';
// María López — invitación ENABLED, sin usar: QR y escaneo "OK".
// OJO: confirmCheckIn() es real. Una vez que este script corre el flujo de
// "scanner-ok", la invitación de María queda agotada (2/2) y una segunda
// corrida contra el MISMO evento la va a mostrar como EXHAUSTED, no ALLOWED.
// Si hay que repetir las capturas, reseedear con test/seed-demo-event.ts.
const GUEST_TOKEN = process.env.SCREENSHOT_GUEST_TOKEN || 'Zf-YNe4suj0LYWB3L0oRVebbrVGgxlii-Ijayc-CPCQ';
const GUEST_SHORT_CODE_OK = process.env.SCREENSHOT_SHORT_OK || 'E5MPJ28A';
// Carlos Ibáñez — invitación BLOCKED: escaneo "denegado".
const GUEST_SHORT_CODE_DENY = process.env.SCREENSHOT_SHORT_DENY || 'TF292L88';
// Lucía Fernández — ya tiene un check-in real hecho por el seed: mi-entrada.
const MI_ENTRADA_DOCUMENT = process.env.SCREENSHOT_DOCUMENT || '35444555';
const MI_ENTRADA_LASTNAME = process.env.SCREENSHOT_LASTNAME || 'Fernández';

// ============ CONFIGURÁ ESTO ============
const config = {
  baseUrl: 'http://localhost:3000',   // <- tu app
  loginUrl: 'http://localhost:3000/login', // <- URL de login (si no hay login, poné null)

  // Credenciales: el login de esta app es por USERNAME, no email
  // (ver SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD en .env)
  username: process.env.TEST_USER || 'ADMIN',
  password: process.env.TEST_PASS || 'admin1234',

  // Selectores reales del formulario (app/login/login-form.tsx)
  selectors: {
    usernameInput: '#username',
    passwordInput: '#password',
    submitButton: 'button[type="submit"]',
  },

  // Secciones a recorrer y capturar (rutas relativas a baseUrl).
  // Rutas reales del panel admin (ver app/(admin)/panel/*). OJO: /panel
  // renderiza directo la lista de eventos, no hay un /panel/eventos separado.
  //
  // Las rutas con :id / :token son datos reales de ESTA base de dev (evento
  // "probando" y su invitado). Si reseteás la base o cambiás de evento de
  // prueba, actualizá los valores de EVENT_ID / GUEST_TOKEN / REG_TOKEN.
  sections: [
    { name: 'dashboard-eventos', path: '/panel' },
    { name: 'evento-nuevo', path: '/panel/eventos/nuevo' },
    { name: 'evento-detalle', path: `/panel/eventos/${EVENT_ID}` },
    { name: 'evento-ingresos', path: `/panel/eventos/${EVENT_ID}/ingresos` },
    { name: 'espacios', path: '/panel/espacios' },
    { name: 'calendario-mes', path: '/panel/calendario' },
    { name: 'usuarios-roles', path: '/panel/usuarios' },
    { name: 'invitacion-qr', path: `/i/${GUEST_TOKEN}` },
    { name: 'formulario-registro', path: `/r/${REG_TOKEN}` },
    { name: 'control-eventos', path: '/control/eventos' },
    { name: 'control-recepcion', path: `/control/${EVENT_ID}` },
  ],

  // Opciones de captura
  fullPage: true,          // captura la página completa, no solo el viewport
  viewport: { width: 1440, height: 900 },
  headless: true,          // false si querés ver el navegador en acción
};
// ==========================================

async function run() {
  const outDir = path.join(__dirname, '..', 'capturas');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: config.headless,
    // Cámara falsa: el scanner pide getUserMedia apenas monta. No la usamos
    // (entramos por el código manual), pero sin esto el navegador se queda
    // esperando el permiso y la sección de código manual nunca se habilita
    // igual — más simple concederla que lidiar con el estado de error.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: config.viewport,
    permissions: ['camera'],
  });
  const page = await context.newPage();

  try {
    // ---- LOGIN ----
    if (config.loginUrl) {
      console.log(`Navegando a login: ${config.loginUrl}`);
      await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

      // Captura del formulario vacío, para el deck
      await page.screenshot({
        path: path.join(outDir, '01-login.png'),
        fullPage: config.fullPage,
      });

      await page.fill(config.selectors.usernameInput, config.username);
      await page.fill(config.selectors.passwordInput, config.password);

      // El login es una Server Action de Next (no un submit HTML clásico):
      // no siempre dispara un evento de "navigation" que Playwright detecte,
      // así que esperamos a que la URL deje de ser /login en vez de esperar
      // waitForNavigation (que puede colgarse hasta el timeout).
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }),
        page.click(config.selectors.submitButton),
      ]);
      await page.waitForLoadState('networkidle');
      console.log(`Login OK, redirigió a ${page.url()}`);
    }

    // ---- RECORRER SECCIONES ----
    for (let i = 0; i < config.sections.length; i++) {
      const section = config.sections[i];
      const url = config.baseUrl.replace(/\/$/, '') + section.path;

      console.log(`Visitando: ${section.name} (${url})`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        // Pequeña espera extra por si hay animaciones/carga de datos
        await page.waitForTimeout(500);

        const fileName = `${String(i + 2).padStart(2, '0')}-${section.name}.png`;
        await page.screenshot({
          path: path.join(outDir, fileName),
          fullPage: config.fullPage,
        });
        console.log(`  ✓ Captura guardada: ${fileName}`);
      } catch (err) {
        console.error(`  ✗ Error en "${section.name}": ${err.message}`);
      }
    }

    // ---- MI ENTRADA (buscar por DNI + apellido) ----
    try {
      console.log('Visitando: mi-entrada (con búsqueda)');
      await page.goto(`${config.baseUrl}/mi-entrada`, { waitUntil: 'networkidle' });
      await page.fill('#document', MI_ENTRADA_DOCUMENT);
      await page.fill('#lastName', MI_ENTRADA_LASTNAME);
      await page.getByRole('button', { name: /buscar/i }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(outDir, `${String(config.sections.length + 2).padStart(2, '0')}-mi-entrada.png`),
        fullPage: config.fullPage,
      });
      console.log('  ✓ Captura guardada: mi-entrada');
    } catch (err) {
      console.error(`  ✗ Error en "mi-entrada": ${err.message}`);
    }

    // ---- SCANNER: código manual, resultado OK ----
    // Usa el respaldo de código manual (sin cámara) para simular el escaneo:
    // ver "Ingresar código manual" en components/scanner/scanner.tsx.
    try {
      console.log('Visitando: scanner (código válido)');
      await page.goto(`${config.baseUrl}/control`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /ingresar código manual/i }).click();
      await page.fill('#manual', GUEST_SHORT_CODE_OK);
      await page.getByRole('button', { name: /^buscar$/i }).click();
      // Fase "ALLOWED": pide cuántas personas y confirma.
      await page.getByRole('button', { name: /confirmar ingreso/i }).click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(outDir, `${String(config.sections.length + 3).padStart(2, '0')}-scanner-ok.png`),
        fullPage: config.fullPage,
      });
      console.log('  ✓ Captura guardada: scanner-ok');
    } catch (err) {
      console.error(`  ✗ Error en "scanner-ok": ${err.message}`);
    }

    // ---- SCANNER: código manual, resultado DENEGADO (invitación bloqueada) ----
    try {
      console.log('Visitando: scanner (código bloqueado)');
      await page.goto(`${config.baseUrl}/control`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /ingresar código manual/i }).click();
      await page.fill('#manual', GUEST_SHORT_CODE_DENY);
      await page.getByRole('button', { name: /^buscar$/i }).click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(outDir, `${String(config.sections.length + 4).padStart(2, '0')}-scanner-deny.png`),
        fullPage: config.fullPage,
      });
      console.log('  ✓ Captura guardada: scanner-deny');
    } catch (err) {
      console.error(`  ✗ Error en "scanner-deny": ${err.message}`);
    }

    // ---- TEMA OSCURO (dashboard) ----
    try {
      console.log('Visitando: dashboard en tema oscuro');
      await page.goto(`${config.baseUrl}/panel`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /cambiar entre tema claro y oscuro/i }).click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(outDir, `${String(config.sections.length + 5).padStart(2, '0')}-tema-oscuro.png`),
        fullPage: config.fullPage,
      });
      console.log('  ✓ Captura guardada: tema-oscuro');
    } catch (err) {
      console.error(`  ✗ Error en "tema-oscuro": ${err.message}`);
    }

    console.log(`\nListo. Capturas en: ${outDir}`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});