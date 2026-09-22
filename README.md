# UCP Management System

Aplikasi estimasi proyek perangkat lunak berbasis **Use Case Point**. Menghitung
UCP dari analisis actor dan use case, lalu menurunkannya menjadi effort, durasi,
kebutuhan tim, biaya, dan penilaian kelayakan.

Antarmuka berupa SPA React, data tersimpan di **MySQL** melalui REST API PHP.
Dirancang untuk pemakaian satu orang pada satu mesin, sehingga tidak memakai
autentikasi.

## Kebutuhan

| Komponen | Versi yang dipakai | Catatan |
|---|---|---|
| PHP | 8.3 | perlu ekstensi `pdo_mysql` |
| MySQL | 8.4 | database dan tabel dibuat otomatis |
| Node.js | 22 | hanya untuk build dan pengembangan |

Tidak perlu menambahkan PHP atau MySQL ke PATH; skrip proyek mencarinya
sendiri di folder Laragon.

Seluruhnya sudah tersedia pada pemasangan Laragon standar.

## Menjalankan

### Produksi (Apache/Laragon)

1. Nyalakan **Apache** dan **MySQL** dari Laragon.
2. Build antarmuka:
   ```
   npm install
   npm run build
   ```
3. Arahkan document root atau vhost ke folder proyek. Berkas `dist/index.html`
   adalah halaman aplikasi, dan folder `api/` dilayani berdampingan dengannya.

Database `ucp_management` beserta seluruh tabelnya dibuat sendiri saat API
pertama kali dipanggil — tidak ada langkah migrasi manual.

### Pengembangan

Jalankan dua proses berdampingan, masing-masing di terminal sendiri:

```
npm run api     # REST API PHP di 127.0.0.1:8787
npm run dev     # Vite di 127.0.0.1:5173, meneruskan /api ke backend
```

MySQL harus tetap menyala. Bila `npm run api` belum berjalan, antarmuka
menampilkan kartu "Server API tidak dapat dihubungi" alih-alih daftar proyek.

`npm run api` **tidak memerlukan PHP pada PATH**. Skrip `scripts/api.mjs`
mencari sendiri `php.exe`: mula-mula dari variabel `UCP_PHP`, lalu PATH, lalu
folder `C:\laragon\bin\php\*` dan `C:\xampp\php`. Untuk menunjuk PHP tertentu:

```
$env:UCP_PHP = "C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe"
npm run api
```

Untuk mengarahkan proxy Vite ke Apache alih-alih server bawaan PHP, setel
`UCP_API_PROXY`, misalnya `UCP_API_PROXY=http://localhost/ucp-management-local`.

### Pengujian

```
npm test        # 31 unit test untuk mesin perhitungan dan normalisasi state
```

## Konfigurasi database

`api/config.php` memakai nilai baku Laragon: `root` tanpa kata sandi pada
`127.0.0.1:3306`, database `ucp_management`. Untuk mengubahnya, setel variabel
lingkungan `UCP_DB_HOST`, `UCP_DB_PORT`, `UCP_DB_NAME`, `UCP_DB_USER`,
`UCP_DB_PASS`, atau salin nilai yang ingin diubah ke `api/config.local.php`
(berkas itu tidak masuk version control).

## Struktur

```
api/          REST API PHP
  index.php   front controller dan routing
  db.php      koneksi PDO dan penyiapan skema
  repo.php    pemetaan tabel <-> bentuk state SPA
  schema.sql  DDL
src/
  calc.js     mesin perhitungan UCP (murni, teruji)
  state.js    skema state, normalisasi, migrasi, penyangga draft
  api.js      klien REST
  main.jsx    antarmuka React
test/         unit test Node
```

## Endpoint

| Metode | Path | Keterangan |
|---|---|---|
| GET | `/api/health` | status API dan jumlah proyek |
| GET | `/api/projects` | daftar ringkas seluruh proyek |
| POST | `/api/projects` | membuat proyek baru dari state |
| GET | `/api/projects/{id}` | isi lengkap satu proyek |
| PUT | `/api/projects/{id}` | menimpa isi proyek |
| DELETE | `/api/projects/{id}` | menghapus proyek beserta seluruh isinya |
| POST | `/api/projects/{id}/duplicate` | menggandakan proyek |

## Catatan rancangan

**Bobot faktor tidak disimpan di database.** Bobot 13 faktor teknis dan 8 faktor
lingkungan adalah bagian dari model UCP, bukan data proyek. Sumber kebenarannya
ada di `src/state.js`; database hanya menyimpan rating yang diisi analis. Dengan
begitu bobot tidak bisa rusak karena data yang salah.

**Kompleksitas use case diturunkan dari jumlah transaksi** sesuai model UCP
(≤3 Simple, 4–7 Average, >7 Complex). Analis dapat mengunci nilai lain lewat
flag override, dan setiap override yang menyimpang ditandai pada panel
peringatan agar keputusan itu tetap terlihat.

**Perubahan tersimpan otomatis.** Bila database sedang tidak terjangkau,
perubahan ditahan sebagai draft di browser dan ditawarkan untuk dipulihkan saat
proyek dibuka kembali, sehingga database yang mati tidak berarti kehilangan
pekerjaan. Gunakan **Export** untuk cadangan di luar database.

**Seluruh masukan divalidasi dua kali**, di browser melalui `normalize()` dan di
server sebelum menyentuh SQL. Pembagian dijaga agar parameter bernilai nol
menghasilkan 0, bukan `Infinity`.
