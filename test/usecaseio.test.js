import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUseCaseSheet,applyUseCaseImport,specUseCaseSheet,LABEL_KOLOM} from '../src/usecaseio.js';
import {newState} from '../src/state.js';
import {calculate} from '../src/calc.js';

const dasar=()=>{
 const s=newState();
 s.modules=[{key:'m1',code:'M1',name:'Autentikasi'}];
 s.useCases=[{id:'u1',code:'UC-001',name:'Login',actor:'Mahasiswa',transactions:3,type:'Simple',override:false,module:'m1'}];
 return s;
};
const lembar=rows=>[{name:'Use Cases',rows:[LABEL_KOLOM,...rows]}];

test('impor membedakan baris baru dan baris yang diperbarui', () => {
 const s=dasar();
 const p=parseUseCaseSheet(lembar([
  ['UC-001','Login Baru','M1','Mahasiswa','5','',''],
  ['UC-900','Cetak Laporan','M1','Admin','9','',''],
 ]),s);
 assert.deepEqual(p.summary,{add:1,update:1,skip:0,modules:0});
 assert.equal(p.rows[0].action,'update');
 assert.equal(p.rows[0].id,'u1');
 assert.equal(p.rows[0].name,'Login Baru');
 assert.equal(p.rows[0].transactions,5);
 assert.equal(p.rows[1].action,'add');
});

test('kompleksitas diturunkan dari transaksi kecuali override aktif', () => {
 const p=parseUseCaseSheet(lembar([
  ['UC-A','Sembilan','','','9','Simple','Tidak'],
  ['UC-B','Sembilan override','','','9','Simple','Ya'],
  ['UC-C','Override tanpa tipe sah','','','9','ngawur','Ya'],
 ]),dasar());
 assert.equal(p.rows[0].type,'Complex','tanpa override, kolom Kompleksitas diabaikan');
 assert.equal(p.rows[0].override,false);
 assert.equal(p.rows[1].type,'Simple');
 assert.equal(p.rows[1].override,true);
 assert.equal(p.rows[2].type,'Complex','tipe tidak sah jatuh ke hasil turunan');
});

test('modul dicocokkan lewat kode, nama, atau gabungannya', () => {
 const s=dasar();
 for(const teks of ['M1','Autentikasi','M1 · Autentikasi','m1','autentikasi']){
  const p=parseUseCaseSheet(lembar([['UC-X','A',teks,'','3','','']]),s);
  assert.equal(p.rows[0].module,'m1',`gagal untuk ${teks}`);
  assert.equal(p.newModules.length,0);
 }
});

test('modul yang belum ada dibuat sekali saja', () => {
 const s=dasar();
 const p=parseUseCaseSheet(lembar([
  ['UC-A','A','Pelaporan','','3','',''],
  ['UC-B','B','Pelaporan','','3','',''],
  ['UC-C','C','M9 · Arsip','','3','',''],
 ]),s);
 assert.equal(p.newModules.length,2);
 assert.equal(p.rows[0].module,p.rows[1].module,'nama modul yang sama memakai kunci yang sama');
 assert.equal(p.newModules[1].code,'M9','kode diambil dari teks berformat kode titik nama');
 assert.equal(p.newModules[1].name,'Arsip');
 const setelah=applyUseCaseImport(s,p);
 assert.equal(setelah.modules.length,3);
});

test('kode kosong menghasilkan kode berurutan tanpa bentrok', () => {
 const s=dasar();
 const p=parseUseCaseSheet(lembar([
  ['','Tanpa kode satu','','','3','',''],
  ['','Tanpa kode dua','','','3','',''],
 ]),s);
 assert.deepEqual(p.rows.map(r=>r.code),['UC-002','UC-003']);
 const kode=applyUseCaseImport(s,p).useCases.map(u=>u.code);
 assert.equal(new Set(kode).size,kode.length,'tidak ada kode kembar setelah diterapkan');
});

test('baris bermasalah dilewati dengan alasan, bukan menggagalkan seluruh impor', () => {
 const p=parseUseCaseSheet(lembar([
  ['UC-A','Sah','','','3','',''],
  ['UC-B','',''],
  ['','','','','',''],
  ['UC-A','Kode kembar','','','3','',''],
  ['TOTAL UUCW','','','','','','15'],
 ]),dasar());
 assert.equal(p.summary.add,1);
 assert.equal(p.summary.skip,2,'baris kosong dan baris total tidak dihitung sebagai dilewati');
 assert.ok(p.rows.find(r=>/kosong/i.test(r.reason||'')));
 assert.ok(p.rows.find(r=>/lebih dari sekali/i.test(r.reason||'')));
});

test('urutan kolom bebas dan kolom asing diabaikan', () => {
 const sheets=[{name:'Data',rows:[
  ['Catatan','Transaksi','Nama','Kode','Harga'],
  ['abaikan','8','Kelola Data','UC-777','999'],
 ]}];
 const p=parseUseCaseSheet(sheets,dasar());
 assert.equal(p.summary.add,1);
 assert.equal(p.rows[0].code,'UC-777');
 assert.equal(p.rows[0].name,'Kelola Data');
 assert.equal(p.rows[0].transactions,8);
 assert.equal(p.rows[0].type,'Complex');
});

test('lembar tanpa judul yang dikenali ditolak dengan penjelasan', () => {
 const p=parseUseCaseSheet([{name:'Acak',rows:[['a','b'],['c','d']]}],dasar());
 assert.ok(p.error);
 assert.equal(p.rows.length,0);
 assert.match(p.error,/judul kolom/i);
});

test('lembar bernama Use Cases didahulukan meski bukan yang pertama', () => {
 const sheets=[
  {name:'Ringkasan',rows:[['Kode','Nama','Transaksi'],['UC-Z','Dari ringkasan','3']]},
  {name:'Use Cases',rows:[['Kode','Nama','Transaksi'],['UC-Y','Dari lembar benar','3']]},
 ];
 const p=parseUseCaseSheet(sheets,dasar());
 assert.equal(p.sheetName,'Use Cases');
 assert.equal(p.rows[0].code,'UC-Y');
});

test('menerapkan impor tidak mengubah state semula', () => {
 const s=dasar();
 const salinan=structuredClone(s);
 const p=parseUseCaseSheet(lembar([['UC-BARU','Tambahan','','','3','','']]),s);
 const setelah=applyUseCaseImport(s,p);
 assert.deepEqual(s,salinan,'state asal harus utuh');
 assert.equal(setelah.useCases.length,2);
 assert.ok(Number.isFinite(calculate(setelah).ucp));
});

test('ekspor dan template menghasilkan kolom yang sama', () => {
 const s=dasar();
 const ekspor=specUseCaseSheet(s);
 const template=specUseCaseSheet(s,{template:true});
 assert.deepEqual(ekspor.sheets[0].columns,LABEL_KOLOM);
 assert.deepEqual(template.sheets[0].columns,LABEL_KOLOM);
 assert.deepEqual(ekspor.sheets[0].rows[0],['UC-001','Login','M1 · Autentikasi','Mahasiswa',3,'Simple','Tidak']);
 assert.equal(ekspor.sheets[1].name,'Petunjuk');
 assert.ok(template.filename.includes('Template'));
});

test('hasil ekspor dapat dibaca kembali tanpa perubahan', () => {
 const s=dasar();
 const spec=specUseCaseSheet(s);
 const p=parseUseCaseSheet([{name:spec.sheets[0].name,rows:[spec.sheets[0].columns,...spec.sheets[0].rows]}],s);
 assert.deepEqual(p.summary,{add:0,update:1,skip:0,modules:0},'seluruh baris cocok dengan yang sudah ada');
 const setelah=applyUseCaseImport(s,p);
 assert.equal(setelah.useCases.length,1);
 assert.equal(setelah.useCases[0].name,'Login');
 assert.equal(setelah.useCases[0].module,'m1');
});

test('lembar tanpa kolom Modul memakai modul yang sedang aktif', () => {
 const s=dasar();
 const sheets=[{name:'Use Cases',rows:[['Kode','Nama','Transaksi'],['UC-A','Tanpa kolom modul','4']]}];
 const tanpa=parseUseCaseSheet(sheets,s);
 assert.equal(tanpa.rows[0].module,'','tanpa modul aktif berarti tanpa modul');
 const dengan=parseUseCaseSheet(sheets,s,{defaultModule:'m1'});
 assert.equal(dengan.rows[0].module,'m1');
 assert.equal(dengan.adaKolomModul,false);
 assert.match(dengan.rows[0].modulLabel,/modul aktif/);
 // kunci modul aktif yang tidak sah diabaikan
 assert.equal(parseUseCaseSheet(sheets,s,{defaultModule:'hantu'}).rows[0].module,'');
});

test('kolom Modul yang kosong tetap berarti tanpa modul', () => {
 const s=dasar();
 const sheets=[{name:'Use Cases',rows:[['Kode','Nama','Modul','Transaksi'],['UC-A','Sengaja lepas','','4']]}];
 const p=parseUseCaseSheet(sheets,s,{defaultModule:'m1'});
 assert.equal(p.adaKolomModul,true);
 assert.equal(p.rows[0].module,'','kolom modul yang ada tapi kosong tidak diisi modul aktif');
});
