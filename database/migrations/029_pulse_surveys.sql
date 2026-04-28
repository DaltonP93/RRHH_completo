-- Migración 029: encuestas pulse anónimas con preguntas tipo escala/texto/opciones

CREATE TABLE IF NOT EXISTS surveys (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NULL,
  anonymous     TINYINT(1) NOT NULL DEFAULT 1,
  audience      ENUM('all','department','role') NOT NULL DEFAULT 'all',
  audience_dept INT NULL,
  audience_role VARCHAR(20) NULL,
  expires_at    DATETIME NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by)    REFERENCES users(id),
  FOREIGN KEY (audience_dept) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_active (active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS survey_questions (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  survey_id   INT NOT NULL,
  position    INT NOT NULL DEFAULT 1,
  type        ENUM('scale','text','choice','yesno') NOT NULL DEFAULT 'scale',
  prompt      VARCHAR(500) NOT NULL,
  options_json JSON NULL,                     -- para 'choice': ["Opt 1","Opt 2"]
  scale_min   INT NULL DEFAULT 1,
  scale_max   INT NULL DEFAULT 5,
  required    TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  INDEX idx_survey (survey_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS survey_responses (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  survey_id     INT NOT NULL,
  user_id       INT NULL,                     -- NULL si es encuesta anónima
  submitted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_survey (survey_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS survey_answers (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  response_id   INT NOT NULL,
  question_id   INT NOT NULL,
  value_int     INT NULL,                     -- para scale, yesno
  value_text    TEXT NULL,                    -- para text, choice
  FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
  INDEX idx_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
