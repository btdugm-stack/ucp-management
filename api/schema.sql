-- =====================================================================
--  UCP Management System - skema basis data
-- =====================================================================
--
--  PEMASANGAN DI SERVER BARU
--
--    mysql -u root -p < api/schema.sql
--
--  Berkas ini membuat databasenya sendiri, jadi tidak perlu memilih
--  database lebih dulu. Seluruh pernyataan memakai IF NOT EXISTS
--  sehingga aman dijalankan berulang kali pada database yang sudah
--  berisi data: tabel yang sudah ada tidak disentuh.
--
--  Bila nama database selain ucp_management dikehendaki, ubah kedua
--  baris CREATE DATABASE dan USE di bawah, lalu beri tahu aplikasi
--  lewat UCP_DB_NAME atau api/config.local.php.
--
--  Aplikasi juga menjalankan berkas ini sendiri saat API pertama kali
--  dipanggil pada database yang masih kosong. Pada jalur itu, baris
--  CREATE DATABASE dan USE dilewati karena nama databasenya sudah
--  ditentukan oleh konfigurasi (lihat api/db.php).
--
--  CATATAN RANCANGAN
--
--  Bobot faktor teknis dan lingkungan sengaja TIDAK disimpan di sini.
--  Bobot itu bagian dari model UCP, bukan data proyek, dan sumber
--  kebenarannya tetap ada di src/state.js supaya tidak bisa rusak oleh
--  data. Yang disimpan hanya rating yang diisi analis.
--
--  Seluruh tabel anak memakai ON DELETE CASCADE, sehingga menghapus
--  satu proyek membersihkan seluruh isinya tanpa menyisakan baris
--  yatim.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `ucp_management`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `ucp_management`;

-- ---------------------------------------------------------------------
--  Proyek: identitas, parameter effort, kelayakan, dan biaya tambahan.
--  Seluruh besaran turunan (UCP, durasi, biaya) dihitung ulang oleh
--  aplikasi dan tidak disimpan, agar tidak pernah basi terhadap datanya.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  code                VARCHAR(50)   NOT NULL DEFAULT '',
  name                VARCHAR(200)  NOT NULL DEFAULT '',
  sponsor             VARCHAR(200)  NOT NULL DEFAULT '',
  owner               VARCHAR(200)  NOT NULL DEFAULT '',
  manager             VARCHAR(200)  NOT NULL DEFAULT '',
  description         TEXT          NULL,
  start_date          DATE          NULL,
  target_date         DATE          NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'Draft',

  -- parameter effort
  phm                 DECIMAL(10,2) NOT NULL DEFAULT 20,
  hours_per_day       DECIMAL(6,2)  NOT NULL DEFAULT 8,
  days_per_month      DECIMAL(6,2)  NOT NULL DEFAULT 22,
  target_months       DECIMAL(8,2)  NOT NULL DEFAULT 10,

  -- masukan manual kalkulasi custom (Mandays dan Man)
  custom_working_days DECIMAL(6,2)  NOT NULL DEFAULT 22,
  custom_project_days DECIMAL(10,2) NOT NULL DEFAULT 120,

  -- penilaian kelayakan
  feas_technical      VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_economic       VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_organizational VARCHAR(10)   NOT NULL DEFAULT 'Medium',
  feas_notes          TEXT          NULL,

  -- biaya di luar sumber daya
  cost_infrastructure DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_license        DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_training       DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_migration      DECIMAL(18,2) NOT NULL DEFAULT 0,

  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projects_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Modul aplikasi, opsional, untuk mengelompokkan use case.
--  module_key dibuat di klien dan ikut tersimpan, bukan memakai id
--  baris: baris anak ditulis ulang setiap penyimpanan sehingga id-nya
--  berubah dan rujukan dari use case akan putus.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_modules (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  module_key VARCHAR(20)  NOT NULL,
  code       VARCHAR(50)  NOT NULL DEFAULT '',
  name       VARCHAR(200) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_module (project_id, module_key),
  KEY idx_modules_project (project_id, sort_order),
  CONSTRAINT fk_modules_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Actor beserta klasifikasinya. Bobot Simple/Average/Complex tidak
--  disimpan karena ditetapkan model UCP.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  Use case. Kompleksitas diturunkan dari jumlah transaksi kecuali
--  is_override bernilai 1. module_key kosong berarti tanpa modul.
-- ---------------------------------------------------------------------
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
  module_key   VARCHAR(20)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_use_cases_project (project_id, sort_order),
  CONSTRAINT fk_use_cases_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Rating faktor teknis dan lingkungan. Hanya rating yang disimpan;
--  kode faktor (T1..T13, E1..E8) merujuk ke daftar baku di
--  src/state.js yang memegang nama, deskripsi, dan bobotnya.
--  Rentang rating -5 sampai 5.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  Distribusi fase SDLC. Bobot seluruh fase harus berjumlah 100 persen;
--  aturan itu ditegakkan aplikasi, bukan basis data.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  Peran pada rencana staffing beserta rate dan alokasinya.
-- ---------------------------------------------------------------------
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
