-- 056_evaluaciones_360.sql
-- Evaluaciones 360 grados / por pares

-- ─── 1. Ampliar appraisals con tipo de evaluación ─────────────────
ALTER TABLE appraisals
  ADD COLUMN IF NOT EXISTS appraisal_type
    ENUM('traditional','360','peer','self_only')
    DEFAULT 'traditional' AFTER template_id,
  ADD COLUMN IF NOT EXISTS anonymize_peers
    TINYINT(1) DEFAULT 1 COMMENT '1 = pares anónimos para el evaluado' AFTER appraisal_type;

-- ─── 2. Evaluadores por pares (peer reviewers) ────────────────────
CREATE TABLE IF NOT EXISTS appraisal_peer_reviewers (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  appraisal_id  INT NOT NULL,
  reviewer_id   INT NOT NULL COMMENT 'user_id del evaluador par',
  reviewer_role ENUM('peer','subordinate','client','self','manager') DEFAULT 'peer',
  weight        DECIMAL(5,2) DEFAULT 1.00 COMMENT 'Peso de esta perspectiva en el puntaje final',
  status        ENUM('invited','accepted','declined','completed') DEFAULT 'invited',
  invited_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME NULL,
  due_date      DATE NULL,
  UNIQUE KEY uk_appraisal_reviewer (appraisal_id, reviewer_id),
  FOREIGN KEY (appraisal_id) REFERENCES appraisals(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 3. Ampliar appraisal_scores para soportar par ───────────────
ALTER TABLE appraisal_scores
  MODIFY COLUMN scorer_role ENUM('self','manager','hr','peer','subordinate','client') NOT NULL,
  ADD COLUMN IF NOT EXISTS peer_reviewer_id INT NULL COMMENT 'FK a appraisal_peer_reviewers' AFTER scorer_role,
  ADD COLUMN IF NOT EXISTS is_anonymous     TINYINT(1) DEFAULT 0 AFTER peer_reviewer_id;

-- ─── 4. Resultados consolidados 360 ──────────────────────────────
CREATE TABLE IF NOT EXISTS appraisal_360_results (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  appraisal_id   INT NOT NULL UNIQUE,
  self_score     DECIMAL(5,2) NULL,
  manager_score  DECIMAL(5,2) NULL,
  peer_score     DECIMAL(5,2) NULL,
  overall_score  DECIMAL(5,2) NULL COMMENT 'Ponderado final',
  gap_self_mgr   DECIMAL(5,2) NULL COMMENT 'self_score - manager_score',
  gap_self_peer  DECIMAL(5,2) NULL COMMENT 'self_score - peer_score',
  generated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appraisal_id) REFERENCES appraisals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. Comentarios cualitativos 360 ─────────────────────────────
CREATE TABLE IF NOT EXISTS appraisal_qualitative_feedback (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  appraisal_id    INT NOT NULL,
  reviewer_id     INT NULL,
  reviewer_role   ENUM('self','manager','hr','peer','subordinate','client') NOT NULL,
  question_key    VARCHAR(60) NOT NULL COMMENT 'ej: strengths, improvements, collaboration',
  response        TEXT,
  is_anonymous    TINYINT(1) DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appraisal_id) REFERENCES appraisals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
