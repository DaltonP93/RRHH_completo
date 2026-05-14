# Checklist de Aceptación — Staging SisHoras

> Completar este checklist antes de dar por aprobado el entorno de staging.
> Marcar cada ítem con `[x]` una vez verificado. Anotar observaciones donde corresponda.

**Fecha de revisión:** ___________________
**Responsable:** ___________________
**Versión desplegada (git commit):** ___________________

---

## 1. Infraestructura — Servidor Ubuntu preparado

- [ ] Servidor Ubuntu 22.04 LTS aprovisionado
- [ ] Mínimo 2 vCPU disponibles (`nproc` >= 2)
- [ ] Mínimo 4 GB RAM disponibles (`free -h` muestra >= 4G total)
- [ ] Mínimo 40 GB de disco disponibles (`df -h /` muestra >= 40G)
- [ ] Puertos 80, 443 y 8080 abiertos en firewall/security group del proveedor
- [ ] Acceso SSH funcional con usuario no-root y privilegios `sudo`
- [ ] UFW configurado: `sudo ufw status` muestra reglas para 22, 80, 443, 8080

---

## 2. Docker instalado

- [ ] `docker --version` retorna versión 24.x o superior
- [ ] `docker compose version` retorna versión 2.x o superior
- [ ] Usuario de despliegue pertenece al grupo `docker` (`groups $USER | grep docker`)
- [ ] `docker run --rm hello-world` finaliza exitosamente sin `sudo`

---

## 3. Repositorio clonado

- [ ] Repositorio clonado en el servidor (`git log --oneline -1` muestra el commit esperado)
- [ ] Rama correcta verificada (`git branch --show-current`)
- [ ] Directorio de trabajo accesible por el usuario de despliegue sin `sudo`

---

## 4. `.env` configurado

- [ ] Archivo `.env` existe en la raíz del proyecto (`ls -la .env`)
- [ ] `DB_HOST` definido (valor `mysql` para Docker interno)
- [ ] `DB_PORT` definido (valor `3306`)
- [ ] `DB_NAME` definido (valor esperado: `asistencia`)
- [ ] `DB_USER` definido
- [ ] `DB_PASSWORD` definido y no vacío
- [ ] `JWT_SECRET` definido con al menos 32 caracteres
- [ ] `REDIS_URL` definido (`redis://redis:6379` para Docker interno)
- [ ] `ATT_HOST` definido con hostname o IP del servidor att2000
- [ ] `ATT_PASSWORD` definido
- [ ] `FRONTEND_URL` apunta al dominio o IP pública del servidor staging
- [ ] No hay contraseñas de ejemplo o hardcodeadas sin cambiar

---

## 5. docker compose staging levanta

- [ ] `docker compose -f docker-compose.staging.yml up -d --build` finaliza sin errores
- [ ] `docker compose -f docker-compose.staging.yml ps` muestra todos los servicios en estado `Up` o `healthy`
- [ ] No hay contenedores en estado `Restarting` o `Exited`
- [ ] `docker stats --no-stream` muestra consumo de memoria dentro de los límites configurados

---

## 6. MySQL responde

- [ ] Contenedor MySQL en estado `healthy` (`docker compose -f docker-compose.staging.yml ps mysql`)
- [ ] `docker compose -f docker-compose.staging.yml exec mysql mysqladmin -u root -p"$DB_ROOT_PASSWORD" ping` retorna `mysqld is alive`
- [ ] Base de datos `asistencia` existe y tiene tablas (`SHOW TABLES;` desde el contenedor)
- [ ] Script `init.sql` ejecutado correctamente (sin errores en logs de mysql)
- [ ] Migrations aplicadas sin errores

---

## 7. Redis responde

- [ ] Contenedor Redis en estado `healthy`
- [ ] `docker compose -f docker-compose.staging.yml exec redis redis-cli ping` retorna `PONG`
- [ ] Conexión desde la API verificada via `/api/health/full` (`"redis": true`)

---

## 8. API responde en `/api/health`

- [ ] `curl -s http://localhost/api/health` retorna HTTP 200
- [ ] Respuesta JSON contiene `"status": "ok"`
- [ ] Logs de la API no muestran errores críticos de arranque
- [ ] Autenticación JWT funciona: login retorna token válido

---

## 9. Web responde en `/`

- [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost/` retorna `200`
- [ ] Página de login carga correctamente en el navegador
- [ ] Login con usuario administrador funciona y redirige al dashboard
- [ ] Sidebar y navegación principal renderizan sin errores en consola del navegador

---

## 10. Analytics responde en `:5000`

- [ ] `curl -s http://localhost:5000/health` retorna HTTP 200
- [ ] Respuesta indica conexión a MySQL correcta
- [ ] Endpoint de gráficas por empleado responde sin error 500
- [ ] Documentación interactiva accesible en `http://localhost:5000/docs`

---

## 11. Bridge responde en `:8081`

- [ ] `curl -s http://localhost:8081/health` retorna HTTP 200
- [ ] Puerto 8080 accesible desde red externa (`nc -zv <IP_STAGING> 8080` desde otra máquina retorna `succeeded`)
- [ ] Logs del bridge no muestran errores de conexión con la API principal

---

## 12. `/api/health/full` OK

- [ ] `curl -s http://localhost/api/health/full | jq .` retorna HTTP 200
- [ ] Campo `"database"` es `true` o `"ok"`
- [ ] Campo `"redis"` es `true` o `"ok"`
- [ ] Campo `"att2000"` es `true` o `"ok"`
- [ ] No hay campos en `"error"` o `"degraded"` inesperados

---

## 13. `/metrics` OK

- [ ] `curl -s http://localhost/metrics` retorna HTTP 200
- [ ] Respuesta contiene métricas en formato Prometheus (líneas con `# HELP` y `# TYPE`)
- [ ] Métricas de `http_requests_total` y `process_cpu_seconds_total` presentes

---

## 14. att2000 — Test de conexión OK

- [ ] Test de conexión al servidor SQL Server `att2000` exitoso sin errores de autenticación ni de red
  - Observaciones: _______________________

---

## 15. att2000 — Schema OK

- [ ] Schema de `att2000` verificado: tabla `CHECKINOUT` accesible y contiene columnas `USERID`, `CHECKTIME`, `CHECKTYPE`
- [ ] Tabla `USERINFO` accesible y contiene columnas `USERID`, `NAME`, `BADGENUMBER`
  - Observaciones: _______________________

---

## 16. att2000 — Counts OK

- [ ] Conteo de registros en `att2000.CHECKINOUT` retorna un número mayor a 0
  - Total de registros: _______
  - Rango de fechas disponible: _______ al _______

---

## 17. Import departments OK

- [ ] Importación de departamentos desde att2000 ejecutada sin errores
  - Departamentos importados: _______
  - Observaciones: _______________________

---

## 18. Import users OK

- [ ] Importación de usuarios/empleados desde att2000 ejecutada sin errores
  - Empleados importados: _______
  - Empleados con nombre vacío o inválido: _______
  - Observaciones: _______________________

---

## 19. Import punches por rango OK

- [ ] Importación de marcadas (punches) por rango de fechas ejecutada sin errores
  - Rango probado: _______ al _______
  - Registros importados: _______
  - Registros con tipo desconocido: _______
  - Observaciones: _______________________

---

## 20. Reconciliación OK

- [ ] Proceso de reconciliación de marcadas ejecutado sin errores críticos
- [ ] `daily_summary` generado para al menos un empleado de prueba
- [ ] Los campos `worked_minutes`, `late_minutes` y `status` tienen valores coherentes
  - Observaciones: _______________________

---

## 21. Unknown events panel OK

- [ ] Panel de eventos desconocidos carga en la interfaz web sin error 500
- [ ] Lista de eventos con empleado no mapeado visible (si aplica)
- [ ] Acción de mapear evento a empleado funciona correctamente

---

## 22. Modo hybrid OK

- [ ] Modo híbrido (att2000 + relojes directos) activado en la configuración
- [ ] La API acepta eventos de ambas fuentes simultáneamente sin conflictos
- [ ] Los registros de ambas fuentes se distinguen en `attendance_logs` por el campo `source`
  - Observaciones: _______________________

---

## 23. Reloj ZKTeco real — Envía evento

- [ ] Al menos un reloj ZKTeco configurado para apuntar a `<IP_STAGING>:8080` (protocolo PUSH)
- [ ] El reloj envía un evento de fichaje al servidor
- [ ] Logs del bridge muestran el evento recibido (`docker compose -f docker-compose.staging.yml logs bridge | grep PUSH`)
  - Dispositivo probado: _______________________

---

## 24. Dashboard realtime — Muestra evento

- [ ] El dashboard en tiempo real muestra el evento del reloj recién recibido sin necesidad de recargar la página
- [ ] Socket.io activo: el indicador de conexión en el dashboard muestra "Conectado"
- [ ] El evento aparece en el live feed en menos de 5 segundos tras el fichaje

---

## 25. `daily_summary` recalcula

- [ ] Proceso de recálculo de `daily_summary` ejecutado manualmente para un empleado de prueba
- [ ] Los valores de `worked_minutes`, `late_minutes` y `status` se actualizan correctamente tras agregar o modificar una marcada

---

## 26. Corrección manual auditada

- [ ] Corrección manual de una marcada realizada por un usuario con rol administrador
- [ ] La corrección queda registrada en el log de auditoría con campos: `modified_by`, `original_value`, `new_value`, `modified_at`
- [ ] Un usuario sin rol administrador no puede realizar la corrección (respuesta 403)

---

## 27. Backup se genera

- [ ] Script de backup de MySQL ejecutado manualmente (`bash scripts/backup-mysql.sh` o equivalente)
- [ ] Archivo `.sql.gz` generado en `backups/daily/`
- [ ] El archivo pesa más de 0 bytes (`ls -lh backups/daily/`)

---

## 28. Restore probado

- [ ] Script de restore ejecutado con el backup generado en el ítem anterior (`bash scripts/restore-backup.sh`)
- [ ] Restore completado sin errores
- [ ] Los datos son consistentes tras la restauración (verificar conteo de tablas principales)
  - Observaciones: _______________________

---

## Resultado final

| Categoría                         | Items | Aprobados | Pendientes |
|-----------------------------------|-------|-----------|------------|
| Infraestructura                   | 7     |           |            |
| Docker instalado                  | 4     |           |            |
| Repositorio clonado               | 3     |           |            |
| .env configurado                  | 12    |           |            |
| docker compose staging levanta    | 4     |           |            |
| MySQL responde                    | 5     |           |            |
| Redis responde                    | 3     |           |            |
| API responde en /api/health       | 4     |           |            |
| Web responde en /                 | 4     |           |            |
| Analytics responde en :5000       | 4     |           |            |
| Bridge responde en :8081          | 3     |           |            |
| /api/health/full OK               | 5     |           |            |
| /metrics OK                       | 3     |           |            |
| att2000 test connection OK        | 1     |           |            |
| att2000 schema OK                 | 2     |           |            |
| att2000 counts OK                 | 1     |           |            |
| import departments OK             | 1     |           |            |
| import users OK                   | 1     |           |            |
| import punches por rango OK       | 1     |           |            |
| reconciliation OK                 | 3     |           |            |
| unknown events panel OK           | 3     |           |            |
| modo hybrid OK                    | 3     |           |            |
| reloj ZKTeco real envía evento    | 3     |           |            |
| dashboard realtime muestra evento | 3     |           |            |
| daily_summary recalcula           | 2     |           |            |
| corrección manual auditada        | 3     |           |            |
| backup se genera                  | 3     |           |            |
| restore probado                   | 3     |           |            |

**Estado general:** [ ] APROBADO  [ ] APROBADO CON OBSERVACIONES  [ ] RECHAZADO

**Observaciones finales:**

_______________________________________________________________________________

_______________________________________________________________________________

**Firma del responsable:** ___________________  **Fecha:** ___________________

---

*Checklist versión 1.1 — Mayo 2026*
