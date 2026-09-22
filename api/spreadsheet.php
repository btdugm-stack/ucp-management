<?php
declare(strict_types=1);

// Pembaca .xlsx. Pasangan dari report.php yang menulisnya.
//
// Berkas yang diimpor bisa berasal dari Excel, LibreOffice, atau Google Sheets,
// yang masing-masing menulis teks dengan cara berbeda: lewat sharedStrings,
// inline string, atau hasil rumus. Ketiganya ditangani di sini agar sisi klien
// cukup menerima daftar baris apa adanya.

/** Ubah referensi sel seperti "BC12" menjadi indeks kolom berbasis nol. */
function ucp_col_index(string $ref): int
{
    if (!preg_match('/^([A-Z]+)/i', $ref, $m)) {
        return 0;
    }
    $huruf = strtoupper($m[1]);
    $n = 0;
    for ($i = 0, $len = strlen($huruf); $i < $len; $i++) {
        $n = $n * 26 + (ord($huruf[$i]) - 64);
    }
    return max(0, $n - 1);
}

function ucp_shared_strings(ZipArchive $zip): array
{
    $xml = $zip->getFromName('xl/sharedStrings.xml');
    if ($xml === false) {
        return [];
    }
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml)) {
        return [];
    }
    $hasil = [];
    foreach ($doc->getElementsByTagName('si') as $si) {
        // Teks bisa terpecah ke beberapa <t> bila sebagian diberi format lain.
        $teks = '';
        foreach ($si->getElementsByTagName('t') as $t) {
            $teks .= $t->textContent;
        }
        $hasil[] = $teks;
    }
    return $hasil;
}

/**
 * @return array daftar sheet: [['name' => string, 'rows' => array<array<string>>], ...]
 */
function ucp_read_xlsx(string $bytes): array
{
    $tmp = tempnam(sys_get_temp_dir(), 'ucpin');
    if ($tmp === false || file_put_contents($tmp, $bytes) === false) {
        throw new RuntimeException('Gagal menyimpan berkas sementara.');
    }
    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) {
        @unlink($tmp);
        throw new RuntimeException('Berkas bukan arsip .xlsx yang dapat dibuka.');
    }

    $wbXml = $zip->getFromName('xl/workbook.xml');
    if ($wbXml === false) {
        $zip->close();
        @unlink($tmp);
        throw new RuntimeException('Berkas tidak berisi workbook Excel.');
    }

    // Peta rId -> berkas sheet, agar urutan dan nama sheet tetap benar
    // meskipun penomoran berkasnya tidak berurutan.
    $target = [];
    $relsXml = $zip->getFromName('xl/_rels/workbook.xml.rels');
    if ($relsXml !== false) {
        $rels = new DOMDocument();
        if (@$rels->loadXML($relsXml)) {
            foreach ($rels->getElementsByTagName('Relationship') as $r) {
                $target[$r->getAttribute('Id')] = ltrim($r->getAttribute('Target'), '/');
            }
        }
    }

    $shared = ucp_shared_strings($zip);
    $wb = new DOMDocument();
    @$wb->loadXML($wbXml);
    $xp = new DOMXPath($wb);
    $xp->registerNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $xp->registerNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');

    $sheets = [];
    $urut = 0;
    foreach ($xp->query('//m:sheets/m:sheet') as $sheet) {
        $urut++;
        $nama = $sheet->getAttribute('name') ?: "Sheet{$urut}";
        $rid = $sheet->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        $path = $target[$rid] ?? "worksheets/sheet{$urut}.xml";
        $xml = $zip->getFromName('xl/' . $path) ?: $zip->getFromName($path);
        if ($xml === false) {
            continue;
        }
        $doc = new DOMDocument();
        if (!@$doc->loadXML($xml)) {
            continue;
        }
        $rows = [];
        foreach ($doc->getElementsByTagName('row') as $row) {
            $baris = [];
            $maks = -1;
            foreach ($row->getElementsByTagName('c') as $c) {
                $i = ucp_col_index($c->getAttribute('r'));
                $tipe = $c->getAttribute('t');
                $nilai = '';
                if ($tipe === 'inlineStr') {
                    foreach ($c->getElementsByTagName('t') as $t) {
                        $nilai .= $t->textContent;
                    }
                } else {
                    $v = $c->getElementsByTagName('v')->item(0);
                    $mentah = $v ? $v->textContent : '';
                    if ($tipe === 's') {
                        $nilai = $shared[(int) $mentah] ?? '';
                    } elseif ($tipe === 'b') {
                        $nilai = $mentah === '1' ? 'TRUE' : 'FALSE';
                    } else {
                        $nilai = $mentah;
                    }
                }
                $baris[$i] = trim($nilai);
                $maks = max($maks, $i);
            }
            // Sel kosong tidak ditulis oleh Excel, jadi lubangnya diisi di sini
            // supaya indeks kolom tetap sejajar dengan baris judul.
            $rapi = [];
            for ($i = 0; $i <= $maks; $i++) {
                $rapi[] = $baris[$i] ?? '';
            }
            $rows[] = $rapi;
        }
        $sheets[] = ['name' => $nama, 'rows' => $rows];
    }

    $zip->close();
    @unlink($tmp);

    if (!$sheets) {
        throw new RuntimeException('Tidak ada lembar kerja yang dapat dibaca dari berkas ini.');
    }
    return $sheets;
}
