-- cleanup-garbage-names.sql
-- Limpia first_name / last_name con basura importada desde att2000.USERINFO.Name
-- cuando el nombre era NULL, vacío, igual al USERID, numérico, o símbolos como "<<<<".
--
-- Uso:  sudo mysql asistencia < cleanup-garbage-names.sql
--
-- Nota: first_name es NOT NULL en el schema → usamos '' en vez de NULL.
-- La UI muestra placeholder "Nombre"/"Apellido" cuando está vacío.

-- 1) first_name sin ninguna letra (dígitos, símbolos, vacío)
UPDATE employees
SET first_name = ''
WHERE first_name NOT REGEXP '[[:alpha:]]';

-- 2) first_name idéntico al code
UPDATE employees
SET first_name = ''
WHERE first_name = code;

-- 3) last_name sin ninguna letra
UPDATE employees
SET last_name = ''
WHERE last_name IS NOT NULL
  AND last_name <> ''
  AND last_name NOT REGEXP '[[:alpha:]]';

-- 4) last_name idéntico al code
UPDATE employees
SET last_name = ''
WHERE last_name = code;

-- Verificación
SELECT
  COUNT(*)                                  AS total,
  SUM(first_name = '' OR first_name IS NULL) AS sin_nombre,
  SUM(first_name REGEXP '[[:alpha:]]')       AS con_letras,
  SUM(first_name = code)                     AS iguales_al_code
FROM employees;
