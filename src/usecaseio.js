import {ucWeights,complexity,effectiveType,deriveComplexity,clamp,num} from './calc.js';
import {nextCode,nextModuleCode,uid} from './state.js';

// Impor dan ekspor use case lewat lembar kerja. Seluruh penafsiran kolom ada
// di sini sebagai fungsi murni, sehingga aturannya dapat diuji tanpa merender
// antarmuka dan tanpa menyentuh database.

const rapi=v=>String(v??'').trim();
const kecil=v=>rapi(v).toLowerCase();
export const LABEL_KOLOM=['Kode','Nama','Modul','Actor','Transaksi','Kompleksitas','Override'];

// Nama kolom yang diterima. Berkas bisa datang dari hasil ekspor aplikasi ini
// maupun disusun sendiri, jadi beberapa penamaan yang lazim ikut dikenali.
const ALIAS={
 code:['kode','id','code','kode use case','use case id'],
 name:['nama','name','nama use case','use case','judul'],
 module:['modul','module','modul aplikasi','kelompok'],
 actor:['actor','aktor','pelaku'],
 transactions:['transaksi','transactions','jumlah transaksi','trx'],
 type:['kompleksitas','complexity','tipe','type'],
 override:['override','manual','override manual']
};

const YA=['ya','yes','true','y','1','manual','benar'];
const isYa=v=>{const t=kecil(v);return YA.some(x=>t===x||t.startsWith(x+' ')||t.startsWith(x+'('))};

function petaKolom(judul){
 const peta={};
 judul.forEach((sel,i)=>{
  const t=kecil(sel);
  if(!t)return;
  for(const [kunci,daftar] of Object.entries(ALIAS)){
   if(peta[kunci]===undefined&&daftar.includes(t))peta[kunci]=i;
  }
 });
 return peta;
}

/** Mencari baris judul: baris pertama yang memuat kolom nama sekaligus kode atau transaksi. */
function cariJudul(rows){
 for(let i=0;i<Math.min(rows.length,20);i++){
  const peta=petaKolom(rows[i]||[]);
  if(peta.name!==undefined&&(peta.code!==undefined||peta.transactions!==undefined))return {baris:i,peta};
 }
 return null;
}

function cocokModul(modules,teks){
 const t=kecil(teks);
 if(!t)return null;
 const bagian=t.split('·').map(x=>x.trim()).filter(Boolean);
 for(const m of modules){
  const kode=kecil(m.code),nama=kecil(m.name);
  const gabung=[kode,nama].filter(Boolean).join(' · ');
  if(t===gabung||(kode&&t===kode)||(nama&&t===nama))return m;
  if(bagian.some(b=>(kode&&b===kode)||(nama&&b===nama)))return m;
 }
 return null;
}

/**
 * Menafsirkan lembar kerja menjadi rencana perubahan. Tidak mengubah apa pun;
 * hasilnya ditinjau lebih dulu oleh pengguna sebelum diterapkan.
 */
export function parseUseCaseSheet(sheets,s,{defaultModule=''}={}){
 const daftar=Array.isArray(sheets)?sheets:[];
 // Lembar yang namanya menyebut use case didahulukan, selebihnya lembar pertama
 // yang memiliki baris judul yang dikenali.
 const urut=[...daftar].sort((a,b)=>(kecil(b.name).includes('use case')?1:0)-(kecil(a.name).includes('use case')?1:0));
 let terpilih=null;
 for(const sheet of urut){
  const judul=cariJudul(sheet.rows||[]);
  if(judul){terpilih={sheet,...judul};break}
 }
 if(!terpilih)return {error:`Tidak menemukan baris judul kolom. Lembar kerja harus memuat kolom ${LABEL_KOLOM.slice(0,2).join(' dan ')}; unduh Template Excel untuk contoh formatnya.`,rows:[],newModules:[]};

 const {sheet,baris,peta}=terpilih;
 // Bila lembar memuat kolom Modul, sel yang kosong berarti sengaja tanpa
 // modul. Bila kolomnya tidak ada sama sekali, lembar itu tidak menyatakan
 // apa pun tentang modul, sehingga baris masuk ke modul yang sedang aktif.
 const adaKolomModul=peta.module!==undefined;
 const bawaan=adaKolomModul?'':(s.modules.some(m=>m.key===defaultModule)?defaultModule:'');
 const rows=[];
 const newModules=[];
 const kodeDipakai=new Set(s.useCases.map(u=>kecil(u.code)).filter(Boolean));
 const kodeBatch=new Set();
 // Daftar kerja dipakai agar kode yang dibuat otomatis tidak bentrok dengan
 // kode yang baru saja dibuat pada baris sebelumnya di berkas yang sama.
 const kerjaUC=[...s.useCases];
 const kerjaModul=[...s.modules];

 for(let i=baris+1;i<sheet.rows.length;i++){
  const sel=sheet.rows[i]||[];
  const ambil=k=>peta[k]===undefined?'':rapi(sel[peta[k]]);
  const kode=ambil('code'),nama=ambil('name');
  if(!sel.some(x=>rapi(x)!==''))continue;                      // baris kosong
  if(/^(total|jumlah|subtotal)\b/i.test(kode||rapi(sel[0])))continue; // baris total hasil ekspor
  const nomor=i+1;

  if(!nama&&!kode){rows.push({nomor,action:'skip',reason:'Nama dan kode kosong.',name:'',code:''});continue}
  if(!nama){rows.push({nomor,action:'skip',reason:'Nama use case kosong.',name:'',code:kode});continue}
  if(kode&&kodeBatch.has(kecil(kode))){rows.push({nomor,action:'skip',reason:`Kode ${kode} muncul lebih dari sekali pada berkas.`,name:nama,code:kode});continue}

  const transactions=clamp(peta.transactions===undefined?3:(rapi(sel[peta.transactions])===''?3:num(String(sel[peta.transactions]).replace(',','.'),3)),0,999);
  const override=peta.override===undefined?false:isYa(sel[peta.override]);
  const tipeTeks=ambil('type');
  const cocokTipe=complexity.find(x=>kecil(x)===kecil(tipeTeks));
  const type=override?(cocokTipe||deriveComplexity(transactions)):deriveComplexity(transactions);

  const modulTeks=ambil('module');
  const modulBawaan=s.modules.find(m=>m.key===bawaan);
  let moduleKey=bawaan,modulLabel=modulBawaan?`${[modulBawaan.code,modulBawaan.name].filter(Boolean).join(' · ')} (modul aktif)`:'Tanpa modul';
  if(modulTeks&&!/^(tanpa modul|-|—)$/i.test(modulTeks)){
   const ada=cocokModul(kerjaModul,modulTeks);
   if(ada){moduleKey=ada.key;modulLabel=[ada.code,ada.name].filter(Boolean).join(' · ')}
   else{
    const bagian=modulTeks.split('·').map(x=>x.trim()).filter(Boolean);
    const baru={key:uid(),code:bagian.length>1?bagian[0]:nextModuleCode(kerjaModul),name:bagian.length>1?bagian.slice(1).join(' · '):modulTeks};
    kerjaModul.push(baru);newModules.push(baru);
    moduleKey=baru.key;modulLabel=`${[baru.code,baru.name].filter(Boolean).join(' · ')} (baru)`;
   }
  }

  const lama=kode?s.useCases.find(u=>kecil(u.code)===kecil(kode)):null;
  const kodeAkhir=kode||nextCode(kerjaUC);
  const isi={code:kodeAkhir,name:nama,actor:ambil('actor'),transactions,type,override,module:moduleKey};
  if(lama){
   rows.push({nomor,action:'update',id:lama.id,...isi,modulLabel,weight:ucWeights[effectiveType(isi)]||0});
  }else{
   kerjaUC.push({...isi,id:'sementara'});
   rows.push({nomor,action:'add',...isi,modulLabel,weight:ucWeights[effectiveType(isi)]||0});
  }
  kodeBatch.add(kecil(kodeAkhir));
  kodeDipakai.add(kecil(kodeAkhir));
 }

 return {sheetName:sheet.name,rows,newModules,adaKolomModul,defaultModuleKey:bawaan,
  summary:{
   add:rows.filter(r=>r.action==='add').length,
   update:rows.filter(r=>r.action==='update').length,
   skip:rows.filter(r=>r.action==='skip').length,
   modules:newModules.length
  }};
}

/** Menerapkan rencana impor ke state. Baris yang dilewati tidak berpengaruh. */
export function applyUseCaseImport(s,parsed){
 if(!parsed||!Array.isArray(parsed.rows))return s;
 const modules=[...s.modules,...(parsed.newModules||[])];
 let useCases=[...s.useCases];
 for(const r of parsed.rows){
  if(r.action==='update'){
   useCases=useCases.map(u=>u.id===r.id?{...u,code:r.code,name:r.name,actor:r.actor,transactions:r.transactions,type:r.type,override:r.override,module:r.module}:u);
  }else if(r.action==='add'){
   useCases.push({id:uid(),code:r.code,name:r.name,actor:r.actor,transactions:r.transactions,type:r.type,override:r.override,module:r.module});
  }
 }
 return {...s,modules,useCases};
}

/** Lembar kerja ekspor, sekaligus berfungsi sebagai template impor. */
export function specUseCaseSheet(s,{template=false}={}){
 const modul=key=>{const m=s.modules.find(x=>x.key===key);return m?[m.code,m.name].filter(Boolean).join(' · '):''};
 const baris=template?[
  ['UC-001','Contoh: Login','M1 · Autentikasi','Mahasiswa',3,'Simple','Tidak'],
  ['','Contoh: kode dikosongkan berarti baris baru','M1 · Autentikasi','Admin',8,'Complex','Tidak'],
 ]:s.useCases.map(u=>[u.code,u.name,modul(u.module),u.actor,num(u.transactions),effectiveType(u),u.override?'Ya':'Tidak']);

 return {
  filename:`${[s.project.code,s.project.name].filter(Boolean).join(' ')||'Proyek UCP'} - Use Cases${template?' (Template)':''}`.replace(/[^A-Za-z0-9 ._-]/g,'').trim()||'Use Cases',
  sheets:[
   {name:'Use Cases',columns:LABEL_KOLOM,rows:baris},
   {name:'Petunjuk',columns:['Kolom','Wajib','Keterangan'],rows:[
    ['Kode','Tidak','Kode use case, misalnya UC-001. Bila cocok dengan use case yang sudah ada, barisnya diperbarui. Bila dikosongkan, use case baru dibuat dengan kode berurutan.'],
    ['Nama','Ya','Nama use case. Baris tanpa nama dilewati.'],
    ['Modul','Tidak','Kode, nama, atau gabungan "M1 · Nama Modul". Modul yang belum ada akan dibuat. Kosongkan untuk tanpa modul.'],
    ['Actor','Tidak','Nama actor. Sebaiknya sama persis dengan daftar pada Actor Analysis; nama di luar daftar tetap disimpan dan ditandai.'],
    ['Transaksi','Tidak','Jumlah transaksi, bilangan 0 sampai 999. Kosong dianggap 3.'],
    ['Kompleksitas','Tidak','Simple, Average, atau Complex. Hanya dipakai bila kolom Override bernilai Ya.'],
    ['Override','Tidak','Ya untuk memakai Kompleksitas yang ditulis manual. Selain itu kompleksitas diturunkan dari jumlah transaksi: ≤3 Simple, 4–7 Average, >7 Complex.'],
    [],
    ['Catatan','','Urutan kolom boleh berbeda dan kolom tambahan diabaikan; yang dicocokkan adalah nama pada baris judul.'],
    ['','','Sel kosong pada kolom yang ada berarti nilai kosong, bukan "biarkan seperti semula". Saat memperbarui baris lama, kolom yang dikosongkan akan ikut mengosongkan nilainya.'],
    ['','','Kolom yang tidak ada sama sekali tidak diubah. Bila kolom Modul tidak ada, seluruh baris masuk ke modul yang sedang aktif.'],
    ['','','Hasil impor selalu ditampilkan sebagai pratinjau lebih dulu sebelum diterapkan.'],
   ]}
  ]
 };
}
