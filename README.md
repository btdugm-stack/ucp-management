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
  schema.sql  DDL (projects + actors, use cases, faktor,
              fase, peran, dan modul)
src/
  calc.js     mesin perhitungan UCP (murni, teruji)
  state.js    skema state, normalisasi, migrasi, penyangga draft
  api.js      klien REST
  main.jsx    antarmuka React
test/         unit test Node
```

## Batch use case lewat Excel

Halaman **Daftar Use Case** memuat baris *Batch Excel* dengan tiga tindakan:

- **Unduh Template** — berkas .xlsx berisi kolom yang diharapkan, dua baris
  contoh, dan lembar *Petunjuk* yang menjelaskan setiap kolom.
- **Export Use Case** — seluruh use case proyek dalam format yang sama,
  sehingga hasilnya dapat disunting lalu diimpor kembali.
- **Import dari Excel** — membaca berkas .xlsx dan menampilkan **pratinjau**
  berisi rencana perubahan. Tidak ada data yang berubah sebelum pratinjau itu
  diterapkan.

Kolom yang dikenali: Kode, Nama, Modul, Actor, Transaksi, Kompleksitas, dan
Override. Urutannya boleh berbeda dan kolom tambahan diabaikan, karena yang
dicocokkan adalah nama pada baris judul. Beberapa penamaan lain juga diterima,
misalnya `ID` untuk Kode atau `Transactions` untuk Transaksi.

Aturan yang berlaku saat impor:

- Kode yang cocok dengan use case yang sudah ada **memperbarui** baris itu;
  kode baru atau kosong **menambah** baris, dengan kode berurutan bila kosong.
- Modul dicocokkan lewat kode, nama, atau gabungan `M1 · Nama Modul`. Modul
  yang belum ada dibuat otomatis dan disebutkan pada pratinjau.
- Kompleksitas tetap diturunkan dari jumlah transaksi, kecuali kolom Override
  bernilai Ya.
- Sel kosong pada kolom yang **ada** berarti nilai kosong, bukan "biarkan
  seperti semula". Kolom yang **tidak ada sama sekali** tidak diubah; bila
  kolom Modul tidak ada, seluruh baris masuk ke modul yang sedang aktif.
- Baris kosong dan baris total hasil ekspor dilewati tanpa membatalkan impor.

Pembacaan .xlsx ditangani `api/spreadsheet.php`, juga memakai ZipArchive bawaan
PHP. Berkas dari Excel, LibreOffice, maupun Google Sheets ditangani karena
ketiganya menulis teks dengan cara berbeda: sharedStrings, inline string, atau
hasil rumus.

## Laporan

Menu **Laporan** pada sidebar menghasilkan dua berkas dari proyek yang sedang
dibuka:

- **Excel (.xlsx)** berisi data masukan dan keluaran, satu lembar per bagian:
  Proyek, Actors, Use Cases, Rekap Modul, Faktor Teknis, Faktor Lingkungan,
  Perhitungan, Fase, Staffing dan Biaya, serta Peringatan.
- **Word (.docx)** berisi ringkasan hasil akhir untuk dibaca dan dilampirkan:
  identitas, ringkasan estimasi, rantai perhitungan, distribusi fase, rekap
  modul, rencana sumber daya, penilaian kelayakan, dan catatan pemeriksaan.

Keduanya adalah berkas Office asli, dihasilkan oleh `api/report.php` memakai
ZipArchive bawaan PHP tanpa pustaka tambahan. Isi laporan disusun di
`src/report.js` dari hasil `calculate()` yang sama dengan yang tampil di layar,
lalu dikirim ke API sebagai daftar lembar dan blok. Server hanya merender, tidak
menghitung, sehingga tidak ada rumus yang ditulis dua kali dalam dua bahasa.

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
| POST | `/api/report/xlsx` | merender lembar kerja menjadi berkas .xlsx |
| POST | `/api/report/docx` | merender blok dokumen menjadi berkas .docx |
| POST | `/api/import/xlsx` | membaca berkas .xlsx menjadi daftar baris |

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

**Modul aplikasi bersifat opsional.** Menambah modul lewat *Add Modul* langsung
menjadikannya modul **aktif**, dan setiap use case yang dibuat sesudahnya masuk
ke modul tersebut. Tujuan penempatan dipindahkan dengan memilih baris lain pada
panel Modul Aplikasi. Tabel use case sendiri tidak memuat kolom penetapan modul;
hasil penempatannya ditinjau pada submenu *Use Case per Modul* yang bersifat
baca saja, sedangkan angkanya pada *Rekap per Modul*.

Daftar use case pada Daftar Use Case disaring mengikuti modul aktif, sehingga
menambah modul baru langsung menyajikan form yang bersih dan memilih modul lain
menampilkan use case milik modul itu. Use case yang belum masuk modul tetap
dapat dibuka lewat baris *Tanpa modul* pada panel Modul Aplikasi, yang muncul
selama masih ada use case di luar modul.

Kolom Actor pada use case memilih dari daftar pada **Actor Analysis**, bukan
teks bebas. Nama actor tersimpan sebagai teks, jadi mengganti nama actor ikut
memperbarui rujukan pada use case; rujukan yang tidak cocok dengan daftar tetap
ditampilkan dan ditandai sebagai tidak terdaftar, serta diingatkan pada panel
peringatan.

Karena penempatan mengikuti modul aktif saat use case dibuat, use case yang
terlanjur masuk modul yang keliru belum dapat dipindahkan dari antarmuka.

Rekap menampilkan jumlah use case, sebaran Simple/Average/Complex, UUCW, UCP,
dan porsi masing-masing modul. Kolom UCP juga tampil pada panel Modul Aplikasi
di Daftar Use Case. Effort serta biaya per modul
dihitung proporsional terhadap UUCW, karena UUCW satu-satunya besaran UCP yang
melekat pada masing-masing use case; UAW, TCF, dan ECF berlaku untuk proyek
secara keseluruhan. Use case yang belum masuk modul tetap dihitung dan muncul
pada baris *Tanpa modul*.

**Menghapus modul ikut menghapus seluruh use case di dalamnya.** Konfirmasinya
menyebutkan berapa use case yang hilang dan berapa UUCW proyek berkurang, karena
tindakan itu tidak dapat dibatalkan. Use case tanpa modul dan modul lain tidak
terpengaruh. Untuk menyelamatkan isinya lebih dulu, gunakan *Export Use Case*
pada Daftar Use Case, atau *Export* JSON pada sidebar.

Kunci modul (`module_key`) dibuat di klien dan ikut tersimpan, bukan memakai id
baris database. Baris anak ditulis ulang setiap penyimpanan sehingga id barisnya
berubah; memakai id baris akan memutus rujukan dari use case.

**Assigned value bawaan** untuk proyek baru mengikuti daftar pada
`defaultTF` dan `defaultEF` di `src/state.js`, bukan nilai seragam. Baseline
bawaan menghasilkan TF 47 (TCF 1,07) dan EF 21,5 (ECF 0,755). Nilai bawaan ini
hanya berlaku untuk proyek baru dan untuk faktor yang tidak punya nilai
tersimpan, sehingga proyek yang sudah ada di database tidak ikut berubah.

**Assigned value menerima nilai negatif.** Kolom yang dapat diisi pada tab
Factors adalah assigned value, sedangkan bobot di sebelahnya ditetapkan model
dan tidak dapat diubah. Rentangnya diperluas menjadi −5 sampai 5 atas
permintaan; UCP standar memakai 0–5, sehingga nilai negatif membalik arah
kontribusi sebuah faktor. Pada E7 dan E8 yang berbobot −1, assigned value
negatif menghasilkan kontribusi positif yang menaikkan EF dan menurunkan ECF.

**Kalkulasi custom** berada pada menu Calculation, submenu *Kalkulasi Custom*,
berdampingan dengan *Kalkulasi UCP* yang memuat rantai perhitungan bakunya.
PM dan M diambil dari perhitungan default — M
adalah durasi terhitung `3 × PM^(1/3)` — sedangkan Working Days dan Hari Durasi
Project diisi manual:

```
Mandays = PM × M × Working Days
Man     = Mandays ÷ Hari Durasi Project
```

Kedua angka manual itu tersimpan per proyek pada kolom `custom_working_days`
dan `custom_project_days`.

Halaman itu juga menyediakan pengalih **Hitung untuk**: *Seluruh Proyek* atau
*Per Modul*. Pada pandangan per modul, hanya effort yang dibagi menurut porsi
UUCW tiap modul; durasi proyek tidak ikut dibagi karena modul berjalan di dalam
rentang waktu yang sama. Dengan begitu jumlah Mandays seluruh modul kembali
tepat ke Mandays proyek. Tombol *Per Modul* mati selama belum ada modul.

**Seluruh masukan divalidasi dua kali**, di browser melalui `normalize()` dan di
server sebelum menyentuh SQL. Pembagian dijaga agar parameter bernilai nol
menghasilkan 0, bukan `Infinity`.
