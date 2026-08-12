-- Login por nombre de usuario en vez de email, y contraseña temporal.
--
-- La migración conserva las cuentas existentes: parte `full_name` en nombre y
-- apellido, y les genera un username sin colisiones.

-- 1. Columnas nuevas, todavía sin restricciones para poder rellenarlas.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN "last_name" TEXT;
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true;

-- Las cuentas que ya existen tienen una contraseña elegida por su dueño: no
-- corresponde obligarlas a cambiarla. El default `true` aplica solo a las
-- cuentas nuevas, que nacen con una contraseña temporal.
UPDATE "users" SET "must_change_password" = false;

-- 2. Partir el nombre completo. Si no tiene espacios, nombre y apellido
--    quedan iguales; el admin puede corregirlo después desde la pantalla.
UPDATE "users"
SET "first_name" = split_part("full_name", ' ', 1),
    "last_name" = NULLIF(
      trim(substring("full_name" FROM position(' ' IN "full_name") + 1)),
      ''
    );

UPDATE "users"
SET "last_name" = "first_name"
WHERE "last_name" IS NULL OR "last_name" = '';

-- 3. Generar el username: inicial del nombre + apellido, sin acentos ni
--    símbolos, en mayúsculas. Los repetidos llevan un número al final.
WITH base AS (
  SELECT
    id,
    NULLIF(
      upper(
        regexp_replace(
          translate(
            left("first_name", 1) || "last_name",
            'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
            'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
          ),
          '[^A-Za-z0-9]', '', 'g'
        )
      ),
      ''
    ) AS candidate
  FROM "users"
),
numbered AS (
  SELECT
    id,
    COALESCE(candidate, 'USUARIO') AS candidate,
    row_number() OVER (
      PARTITION BY COALESCE(candidate, 'USUARIO') ORDER BY id
    ) AS rn
  FROM base
)
UPDATE "users" u
SET "username" = CASE
  WHEN n.rn = 1 THEN n.candidate
  ELSE n.candidate || n.rn::text
END
FROM numbered n
WHERE u.id = n.id;

-- 4. Ahora sí, las restricciones.
ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- 5. El email pasa a ser un dato de contacto opcional.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "users" DROP COLUMN "full_name";
