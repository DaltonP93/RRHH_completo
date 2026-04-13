@echo off
echo ============================================
echo  SisHoras - Iniciando Sistema Completo
echo ============================================

REM 1. MySQL (si no está corriendo como servicio)
sc query MySQL84 >nul 2>&1
if %errorlevel% neq 0 (
  echo [MySQL] Iniciando mysqld...
  start /B "MySQL" "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --datadir="C:\ProgramData\MySQL\MySQL Server 8.4\Data" --port=3306
  timeout /t 3 /nobreak >nul
) else (
  net start MySQL84 >nul 2>&1
  echo [MySQL] Servicio iniciado.
)

REM 2. Redis (servicio)
net start Redis >nul 2>&1
echo [Redis] Servicio iniciado.

REM 3. API Express
echo [API] Iniciando en puerto 4000...
start "API Express" cmd /k "cd /d C:\Users\Dell\Music\SisHoras\nuevo-sistema\api && node src/index.js"
timeout /t 2 /nobreak >nul

REM 4. Analytics FastAPI
echo [Analytics] Iniciando en puerto 5000...
start "Analytics FastAPI" cmd /k "cd /d C:\Users\Dell\Music\SisHoras\nuevo-sistema\analytics && C:\Users\Dell\AppData\Local\Programs\Python\Python312\python.exe -m uvicorn main:app --host 0.0.0.0 --port 5000"
timeout /t 2 /nobreak >nul

REM 5. Bridge ZKTeco
echo [Bridge] Iniciando en puerto 8080/8081...
start "Bridge ZKTeco" cmd /k "cd /d C:\Users\Dell\Music\SisHoras\nuevo-sistema\bridge && node src/index.js"
timeout /t 2 /nobreak >nul

REM 6. Web Next.js
echo [Web] Iniciando en puerto 3000...
start "Web Next.js" cmd /k "cd /d C:\Users\Dell\Music\SisHoras\nuevo-sistema\web && npm run dev"

echo.
echo ============================================
echo  Sistema iniciado. Abre: http://localhost:3000
echo  Usuario: admin  /  Contraseña: Admin1234!
echo ============================================
pause
