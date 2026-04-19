-- cleanup-garbage-names.sql
-- Limpia first_name / last_name con basura importada desde att2000.USERINFO.Name
-- cuando el nombre era NULL, vacío, igual al USERID, numérico, o símbolos como "<<<<".
--
-- Uso:  sudo mysql asistencia < cleanup-garbage-names.sql
--
-- Estrategia: poner a NULL (no borrar registros). Luego la UI muestra
-- placeholder "Nombre" / "Apellido" en cursiva y el usuario puede editar inline.

-- 1) first_name que NO contiene ninguna letra (solo dígitos, símbolos, vacío)
UPDATE employees
SET first_name = NULL
WHERE first_name IS NOT NULL
  AND first_name NOT REGEXP '[[:alpha:]]';

-- 2) first_name idéntico al code (ZKTeco usa USERID como "nombre" por defecto)
UPDATE employees
SET first_name = NULL
WHERE first_name = code;

-- 3) last_name que NO contiene ninguna letra
UPDATE employees
SET last_name = NULL
WHERE last_name IS NOT NULL
  AND last_name NOT REGEXP '[[:alpha:]]';

-- 4) last_name idéntico al code
UPDATE employees
SET last_name = NULL
WHERE last_name = code;

-- Verificación
SELECT
  COUNT(*)                                              AS total,
  SUM(first_name IS NULL OR first_name = '')            AS sin_nombre,
  SUM(last_name  IS NULL OR last_name  = '')            AS sin_apellido
FROM employees;
