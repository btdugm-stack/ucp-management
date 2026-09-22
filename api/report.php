<?php
declare(strict_types=1);

// Penghasil berkas .xlsx dan .docx. Keduanya adalah arsip ZIP berisi XML,
// dan PHP sudah membawa ZipArchive sehingga tidak perlu pustaka tambahan.
//
// Berkas ini sengaja tidak tahu apa pun tentang Use Case Point. Isi laporan
// disusun di sisi klien yang memegang mesin perhitungan, lalu dikirim ke sini
// sebagai daftar sheet dan blok. Dengan begitu tidak ada rumus yang ditulis
// dua kali dalam dua bahasa dan berisiko melenceng satu sama lain.

function ucp_xml(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function ucp_zip(array $files): string
{
    $tmp = tempnam(sys_get_temp_dir(), 'ucp');
    if ($tmp === false) {
        throw new RuntimeException('Gagal membuat berkas sementara.');
    }
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('Gagal membuka arsip sementara.');
    }
    foreach ($files as $path => $content) {
        $zip->addFromString($path, $content);
    }
    $zip->close();
    $bytes = file_get_contents($tmp);
    @unlink($tmp);
    if ($bytes === false) {
        throw new RuntimeException('Gagal membaca arsip yang dihasilkan.');
    }
    return $bytes;
}

/** Nomor kolom 1 menjadi A, 27 menjadi AA, dan seterusnya. */
function ucp_col(int $n): string
{
    $s = '';
    while ($n > 0) {
        $n--;
        $s = chr(65 + $n % 26) . $s;
        $n = intdiv($n, 26);
    }
    return $s;
}

function ucp_cell(string $ref, $value, int $style): string
{
    if ($value === null || $value === '') {
        return sprintf('<c r="%s" s="%d"/>', $ref, $style);
    }
    if (is_bool($value)) {
        $value = $value ? 'Ya' : 'Tidak';
    }
    if (is_int($value) || is_float($value)) {
        if (!is_finite((float) $value)) {
            return sprintf('<c r="%s" s="%d" t="inlineStr"><is><t>-</t></is></c>', $ref, $style);
        }
        return sprintf('<c r="%s" s="%d"><v>%s</v></c>', $ref, $style, rtrim(rtrim(number_format((float) $value, 6, '.', ''), '0'), '.') ?: '0');
    }
    return sprintf('<c r="%s" s="%d" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>', $ref, $style, ucp_xml((string) $value));
}

/**
 * @param array $spec ['sheets' => [['name'=>string,'columns'=>string[],'rows'=>array[]], ...]]
 */
function ucp_xlsx(array $spec): string
{
    $sheets = array_values(array_filter($spec['sheets'] ?? [], 'is_array'));
    if (!$sheets) {
        $sheets = [['name' => 'Kosong', 'columns' => ['Tidak ada data'], 'rows' => []]];
    }

    $files = [];
    $workbookSheets = '';
    $workbookRels = '';
    $overrides = '';
    $dipakai = [];

    foreach ($sheets as $i => $sheet) {
        $n = $i + 1;
        // Nama sheet Excel maksimal 31 karakter, tanpa : \ / ? * [ ], dan unik.
        $name = preg_replace('/[:\\\\\\/?*\\[\\]]/u', '-', (string) ($sheet['name'] ?? "Sheet{$n}"));
        $name = mb_substr(trim($name) ?: "Sheet{$n}", 0, 31);
        $dasar = $name;
        $ulang = 2;
        while (isset($dipakai[mb_strtolower($name)])) {
            $suffix = ' (' . $ulang++ . ')';
            $name = mb_substr($dasar, 0, 31 - mb_strlen($suffix)) . $suffix;
        }
        $dipakai[mb_strtolower($name)] = true;

        $columns = array_values($sheet['columns'] ?? []);
        $rows = array_values(array_filter($sheet['rows'] ?? [], 'is_array'));

        $lebar = [];
        $xmlRows = '';
        $r = 0;
        if ($columns) {
            $r++;
            $xmlRows .= sprintf('<row r="%d">', $r);
            foreach ($columns as $ci => $label) {
                $xmlRows .= ucp_cell(ucp_col($ci + 1) . $r, $label, 1);
                $lebar[$ci] = max($lebar[$ci] ?? 0, mb_strlen((string) $label));
            }
            $xmlRows .= '</row>';
        }
        foreach ($rows as $row) {
            $r++;
            $xmlRows .= sprintf('<row r="%d">', $r);
            foreach (array_values($row) as $ci => $value) {
                $xmlRows .= ucp_cell(ucp_col($ci + 1) . $r, $value, 0);
                $lebar[$ci] = max($lebar[$ci] ?? 0, mb_strlen(is_scalar($value) ? (string) $value : ''));
            }
            $xmlRows .= '</row>';
        }

        $cols = '';
        if ($lebar) {
            $cols = '<cols>';
            foreach ($lebar as $ci => $w) {
                $cols .= sprintf('<col min="%d" max="%d" width="%.2f" customWidth="1"/>', $ci + 1, $ci + 1, min(60, max(10, $w + 3)));
            }
            $cols .= '</cols>';
        }

        $freeze = $columns ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
        $files["xl/worksheets/sheet{$n}.xml"] =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . $freeze . $cols . '<sheetData>' . $xmlRows . '</sheetData></worksheet>';

        $workbookSheets .= sprintf('<sheet name="%s" sheetId="%d" r:id="rId%d"/>', ucp_xml($name), $n, $n);
        $workbookRels .= sprintf('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>', $n, $n);
        $overrides .= sprintf('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>', $n);
    }

    $styleId = count($sheets) + 1;
    $files['[Content_Types].xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        . $overrides . '</Types>';

    $files['_rels/.rels'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        . '</Relationships>';

    $files['xl/workbook.xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheets>' . $workbookSheets . '</sheets></workbook>';

    $files['xl/_rels/workbook.xml.rels'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . $workbookRels
        . sprintf('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>', $styleId)
        . '</Relationships>';

    $files['xl/styles.xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FFF1EADF"/><bgColor indexed="64"/></patternFill></fill></fills>'
        . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="2">'
        . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        . '</cellXfs></styleSheet>';

    return ucp_zip($files);
}

function ucp_docx_teks(string $text, bool $bold = false, int $size = 20): string
{
    $props = '<w:rPr>' . ($bold ? '<w:b/>' : '') . sprintf('<w:sz w:val="%d"/><w:szCs w:val="%d"/>', $size, $size) . '</w:rPr>';
    return '<w:r>' . $props . '<w:t xml:space="preserve">' . ucp_xml($text) . '</w:t></w:r>';
}

function ucp_docx_paragraf(string $text, array $opt = []): string
{
    $align = $opt['align'] ?? null;
    $pPr = '<w:pPr>';
    if (!empty($opt['style'])) {
        $pPr .= sprintf('<w:pStyle w:val="%s"/>', ucp_xml($opt['style']));
    }
    if ($align) {
        $pPr .= sprintf('<w:jc w:val="%s"/>', ucp_xml($align));
    }
    $pPr .= sprintf('<w:spacing w:before="%d" w:after="%d"/>', $opt['before'] ?? 0, $opt['after'] ?? 120);
    $pPr .= '</w:pPr>';
    return '<w:p>' . $pPr . ucp_docx_teks($text, $opt['bold'] ?? false, $opt['size'] ?? 20) . '</w:p>';
}

function ucp_docx_tabel(array $columns, array $rows): string
{
    $lebar = 9000;
    $n = max(1, count($columns) ?: count($rows[0] ?? [1]));
    $per = intdiv($lebar, $n);
    $xml = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>'
        . '<w:tblBorders>'
        . '<w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="single" w:sz="4" w:color="D9D9D9"/>'
        . '<w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/><w:right w:val="single" w:sz="4" w:color="D9D9D9"/>'
        . '<w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/>'
        . '</w:tblBorders></w:tblPr><w:tblGrid>' . str_repeat(sprintf('<w:gridCol w:w="%d"/>', $per), $n) . '</w:tblGrid>';

    $baris = function (array $cells, bool $header) use ($per): string {
        $tr = '<w:tr>';
        if ($header) {
            $tr = '<w:tr><w:trPr><w:tblHeader/></w:trPr>';
        }
        foreach (array_values($cells) as $cell) {
            $shd = $header ? '<w:shd w:val="clear" w:color="auto" w:fill="F1EADF"/>' : '';
            $tr .= '<w:tc><w:tcPr>' . sprintf('<w:tcW w:w="%d" w:type="dxa"/>', $per) . $shd . '</w:tcPr>'
                . '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>'
                . ucp_docx_teks(is_scalar($cell) ? (string) $cell : '', $header, 18) . '</w:p></w:tc>';
        }
        return $tr . '</w:tr>';
    };

    if ($columns) {
        $xml .= $baris($columns, true);
    }
    foreach ($rows as $row) {
        if (is_array($row)) {
            $xml .= $baris($row, false);
        }
    }
    return $xml . '</w:tbl>' . '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>';
}

/**
 * @param array $spec ['title'=>string,'subtitle'=>string,'blocks'=>[['type'=>...], ...]]
 */
function ucp_docx(array $spec): string
{
    $body = '';
    if (!empty($spec['title'])) {
        $body .= ucp_docx_paragraf((string) $spec['title'], ['bold' => true, 'size' => 36, 'after' => 60]);
    }
    if (!empty($spec['subtitle'])) {
        $body .= ucp_docx_paragraf((string) $spec['subtitle'], ['size' => 20, 'after' => 260]);
    }
    foreach (($spec['blocks'] ?? []) as $block) {
        if (!is_array($block)) {
            continue;
        }
        $type = $block['type'] ?? 'paragraph';
        if ($type === 'heading') {
            $body .= ucp_docx_paragraf((string) ($block['text'] ?? ''), ['bold' => true, 'size' => 26, 'before' => 240, 'after' => 100]);
        } elseif ($type === 'table') {
            $body .= ucp_docx_tabel(array_values($block['columns'] ?? []), array_values($block['rows'] ?? []));
        } elseif ($type === 'bullets') {
            foreach (($block['items'] ?? []) as $item) {
                $body .= ucp_docx_paragraf('•  ' . (is_scalar($item) ? (string) $item : ''), ['size' => 19, 'after' => 60]);
            }
        } else {
            $body .= ucp_docx_paragraf((string) ($block['text'] ?? ''), ['size' => 20, 'after' => 140]);
        }
    }

    $files = [];
    $files['[Content_Types].xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        . '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        . '</Types>';
    $files['_rels/.rels'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        . '</Relationships>';
    $files['word/_rels/document.xml.rels'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        . '</Relationships>';
    $files['word/styles.xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        . '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>'
        . '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>'
        . '</w:styles>';
    $files['word/document.xml'] =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        . $body
        . '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
        . '</w:body></w:document>';

    return ucp_zip($files);
}
