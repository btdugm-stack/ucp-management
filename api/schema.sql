-- Skema UCP Management System.
-- Dijalankan otomatis oleh api/db.php saat tabel belum ada, dan aman
-- dieksekusi berulang kali karena seluruhnya memakai IF NOT EXISTS.
--
-- Bobot faktor teknis dan lingkungan sengaja TIDAK disimpan di sini.
-- Bobot itu bagian dari model UCP, bukan data proyek, dan sumber
-- kebenarannya tetap ada di src/state.js supaya tidak bisa rusak.

CREATE TABLE IF NOT EXISTS projects (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(50)   NOT NULL DEFAULT '',
  name                VARCHAR(200)  NOT NULL DEFAULT '',
  sponsor             VARCHAR(200)  NOT NULL DEFAULT '',
  owner               VARCHAR(200)  NOT NULL DEFAULT '',
  manager             VARCHAR(200)  NOT NULL DEFAULT '',
  description         TEXT          NULL,
  start_date          DATE          NULL,
  target_date         DATE          NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'Draft',

  phm                 DECIMAL(10,2) NOT NULL DEFAULT 20,
  hours_per_day       DECIMAL(6,2)  NOT NULL DEFAULT 8,
  days_per_month      DECIMAL(6,2)  NOT NULL DEFAULT 22,
  target_months       DECIMAL(8,2)  NOT NULL DEFAULT 10,

  feas_technical      VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_economic       VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_organizational VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_notes          TEXT          NULL,

  cost_infrastructure DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_license        DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_training       DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_migration      DECIMAL(18,2) NOT NULL DEFAULT 0,

  custom_working_days DECIMAL(6,2)  NOT NULL DEFAULT 22,
  custom_project_days DECIMAL(10,2) NOT NULL DEFAULT 120,

  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projects_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_actors (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  name       VARCHAR(200) NOT NULL DEFAULT '',
  type       VARCHAR(10)  NOT NULL DEFAULT 'Simple',
  qty        INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_actors_project (project_id, sort_order),
  CONSTRAINT fk_actors_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_use_cases (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  sort_order   INT          NOT NULL DEFAULT 0,
  code         VARCHAR(50)  NOT NULL DEFAULT '',
  name         VARCHAR(200) NOT NULL DEFAULT '',
  actor        VARCHAR(200) NOT NULL DEFAULT '',
  transactions INT          NOT NULL DEFAULT 0,
  type         VARCHAR(10)  NOT NULL DEFAULT 'Simple',
  is_override  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_use_cases_project (project_id, sort_order),
  CONSTRAINT fk_use_cases_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hanya rating yang disimpan; kode faktor (T1..T13, E1..E8) merujuk ke
-- daftar baku di src/state.js yang memegang nama, deskripsi, dan bobot.
CREATE TABLE IF NOT EXISTS project_factors (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id  INT UNSIGNED NOT NULL,
  kind        VARCHAR(15)  NOT NULL,
  factor_code VARCHAR(5)   NOT NULL,
  rating      DECIMAL(5,2) NOT NULL DEFAULT 3,
  sort_order  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_factor (project_id, kind, factor_code),
  CONSTRAINT fk_factors_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_phases (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  name       VARCHAR(100) NOT NULL DEFAULT '',
  weight     DECIMAL(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_phases_project (project_id, sort_order),
  CONSTRAINT fk_phases_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_roles (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED  NOT NULL,
  sort_order INT           NOT NULL DEFAULT 0,
  name       VARCHAR(200)  NOT NULL DEFAULT '',
  rate       DECIMAL(18,2) NOT NULL DEFAULT 0,
  fte        DECIMAL(8,2)  NOT NULL DEFAULT 0,
  allocation DECIMAL(6,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_roles_project (project_id, sort_order),
  CONSTRAINT fk_roles_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
