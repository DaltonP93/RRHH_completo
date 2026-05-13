/**
 * worker-documents — Generación de documentos PDF en background
 *
 * Corre como proceso PM2 separado (cwd: api/).
 * Procesa jobs de documents con status='generating'
 * que fueron encolados por la API.
 *
 * Variables de entorno:
 *   DOCUMENT_WORKER_INTERVAL_MS = 10000
 *   DOCUMENT_STORAGE_PATH       = ./uploads/documents
 */

require('dotenv').config();
process.env.SERVICE_NAME = 'worker-documents';

const fs   = require('fs');
const path = require('path');
const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');

const INTERVAL_MS    = parseInt(process.env.DOCUMENT_WORKER_INTERVAL_MS || '10000');
const STORAGE_PATH   = process.env.DOCUMENT_STORAGE_PATH || path.join(__dirname, '..', '..', 'uploads', 'documents');

// Asegurar directorio de almacenamiento
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// ─── Renderizar variables en plantilla ───────────────────────────
function renderTemplate(template, vars) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = key.trim().split('.').reduce((o, k) => o?.[k], vars);
    return val !== undefined ? String(val) : `{{${key.trim()}}}`;
  });
}

// ─── Generar PDF con ReportLab-like via html ─────────────────────
async function generatePdf(htmlContent, outputPath) {
  // Usar puppeteer si está disponible, sino guardar HTML
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
    await browser.close();
    return true;
  } catch {
    // Puppeteer no disponible — guardar como HTML
    const htmlPath = outputPath.replace('.pdf', '.html');
    fs.writeFileSync(htmlPath, htmlContent);
    return false;
  }
}

// ─── Procesar un documento ───────────────────────────────────────
async function processDocument(doc) {
  logger.info(`Generando documento #${doc.id} tipo=${doc.document_type}`);

  try {
    // Obtener empleado y datos del documento
    const [[employee]] = await sequelize.query(
      `SELECT e.*, CONCAT(e.first_name, ' ', e.last_name) AS full_name,
              d.name AS department_name, p.name AS position_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id
       WHERE e.id = ?`,
      { replacements: [doc.employee_id] }
    );

    if (!employee) {
      throw new Error(`Empleado #${doc.employee_id} no encontrado`);
    }

    // Obtener plantilla si existe
    let htmlContent = doc.content_html || '<p>Documento sin contenido</p>';
    if (doc.template_id) {
      const [[template]] = await sequelize.query(
        'SELECT * FROM document_templates WHERE id = ?',
        { replacements: [doc.template_id] }
      );
      if (template) {
        const vars = {
          employee,
          company: { name: process.env.COMPANY_NAME || 'Empresa' },
          document: doc,
          date: { today: new Date().toLocaleDateString('es-PY') },
        };
        htmlContent = renderTemplate(template.body_html || template.content || '', vars);
      }
    }

    // Calcular hash SHA-256 del contenido
    const { createHash } = require('crypto');
    const contentHash = createHash('sha256').update(htmlContent).digest('hex');

    // Generar archivo
    const fileName = `doc_${doc.id}_${Date.now()}.pdf`;
    const filePath = path.join(STORAGE_PATH, fileName);
    const isPdf = await generatePdf(htmlContent, filePath);
    const actualFile = isPdf ? fileName : fileName.replace('.pdf', '.html');
    const actualPath = path.join(STORAGE_PATH, actualFile);

    // Actualizar documento
    await sequelize.query(`
      UPDATE documents SET
        status = 'generated',
        file_path = ?,
        content_hash = ?,
        generated_at = NOW(),
        file_size = ?
      WHERE id = ?
    `, { replacements: [
      actualFile,
      contentHash,
      fs.existsSync(actualPath) ? fs.statSync(actualPath).size : 0,
      doc.id
    ]});

    // Registrar en audit log
    await sequelize.query(`
      INSERT INTO document_audit_logs (document_id, action, performed_at, details_json)
      VALUES (?, 'generated', NOW(), ?)
    `, { replacements: [doc.id, JSON.stringify({ file: actualFile, hash: contentHash })] }).catch(() => {});

    logger.info(`Documento #${doc.id} generado: ${actualFile} (hash: ${contentHash.slice(0, 8)}...)`);
  } catch (err) {
    await sequelize.query(
      "UPDATE documents SET status='error', error_message=? WHERE id=?",
      { replacements: [err.message, doc.id] }
    );
    logger.error(`Error generando documento #${doc.id}: ${err.message}`);
  }
}

// ─── Poll ────────────────────────────────────────────────────────
async function processBatch() {
  try {
    const [docs] = await sequelize.query(`
      SELECT * FROM documents
      WHERE status = 'generating'
      ORDER BY created_at ASC
      LIMIT 5
    `);

    for (const doc of docs) {
      await processDocument(doc);
    }
  } catch (err) {
    logger.error('Error en poll worker-documents: ' + err.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  logger.info(`worker-documents iniciado — storage: ${STORAGE_PATH}`);
  await sequelize.authenticate();
  logger.info(`Poll cada ${INTERVAL_MS / 1000}s`);

  await processBatch();
  setInterval(processBatch, INTERVAL_MS);
}

main().catch(err => {
  logger.error('worker-documents error fatal: ' + err.message);
  process.exit(1);
});
