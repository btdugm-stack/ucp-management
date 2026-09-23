import {actorWeights,ucWeights,extraKeys,effectiveType,deriveComplexity,num} from './calc.js';

// Penyusun isi laporan. Seluruh angka diambil dari hasil calculate() yang
// sama dengan yang tampil di layar, sehingga laporan tidak pernah menyajikan
// angka yang berbeda dari aplikasinya.

const n2=v=>Math.round(num(v)*100)/100;
const n3=v=>Math.round(num(v)*1000)/1000;
const tanggal=()=>new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeStyle:'short'}).format(new Date());
const rupiah=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(num(v));
const angka=v=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(num(v));
const namaModul=(s,key)=>{const m=s.modules.find(x=>x.key===key);return m?[m.code,m.name].filter(Boolean).join(' · '):'Tanpa modul'};

export const namaBerkas=(s,jenis)=>{
 const dasar=[s.project.code,s.project.name].filter(Boolean).join(' ')||'Proyek UCP';
 return `${dasar} - ${jenis}`.replace(/[^A-Za-z0-9 ._-]/g,'').trim()||`Laporan ${jenis}`;
};

// ---------------------------------------------------------------- Excel ----
// Berisi data masukan dan keluaran per bagian, satu sheet per modul aplikasi
// agar dapat ditelusuri ulang dan dihitung sendiri oleh pembaca.
export function specExcel(s,c,issues){
 const sheets=[];

 sheets.push({name:'Proyek',columns:['Keterangan','Nilai'],rows:[
  ['Kode Proyek',s.project.code],
  ['Nama Proyek',s.project.name],
  ['Sponsor',s.project.sponsor],
  ['Business Owner',s.project.owner],
  ['Project Manager',s.project.manager],
  ['Deskripsi',s.project.description],
  ['Tanggal Mulai',s.project.start],
  ['Target Selesai',s.project.target],
  ['Status',s.project.status],
  [],
  ['Person Hour Multiplier (PHM)',num(s.params.phm)],
  ['Jam Kerja per Hari',num(s.params.hours)],
  ['Hari Kerja per Bulan',num(s.params.days)],
  ['Target Durasi (bulan)',num(s.params.targetMonths)],
  [],
  ['Kelayakan Teknis',s.feas.technical],
  ['Kelayakan Ekonomi',s.feas.economic],
  ['Kelayakan Organisasi',s.feas.organizational],
  ['Catatan Kelayakan',s.feas.notes],
  [],
  ['Laporan dibuat',tanggal()],
 ]});

 sheets.push({name:'Actors',columns:['Actor','Klasifikasi','Jumlah','Bobot','Subtotal'],rows:[
  ...s.actors.map(a=>[a.name,a.type,num(a.qty),actorWeights[a.type]||0,num(a.qty)*(actorWeights[a.type]||0)]),
  [],
  ['TOTAL UAW','','','',c.uaw],
 ]});

 sheets.push({name:'Use Cases',columns:['ID','Nama','Modul','Actor','Transaksi','Kompleksitas','Override','Bobot'],rows:[
  ...s.useCases.map(u=>{const eff=effectiveType(u);return [
   u.code,u.name,namaModul(s,u.module),u.actor,num(u.transactions),eff,
   u.override?`Ya (turunan: ${deriveComplexity(u.transactions)})`:'Tidak',
   ucWeights[eff]||0];}),
  [],
  ['TOTAL UUCW','','','','','','',c.uucw],
 ]});

 const jml=k=>c.moduleRows.reduce((a,r)=>a+r[k],0);
 sheets.push({name:'Rekap Modul',columns:['Modul','Kode','Use Case','Simple','Average','Complex','UAW','UUCW','UCP','Effort (PM)','Durasi (bulan)','Mandays','Man','Biaya (Rp)'],rows:[
  ...c.moduleRows.map(r=>[r.name,r.code,r.count,r.Simple,r.Average,r.Complex,n2(r.uaw),r.uucw,n2(r.ucp),n2(r.pm),n2(r.duration),n2(r.mandays),n2(r.man),Math.round(r.cost)]),
  [],
  ['JUMLAH MODUL','',s.useCases.length,'','','','',c.uucw,n2(jml('ucp')),n2(jml('pm')),'',n2(jml('mandays')),n2(jml('man')),Math.round(c.cost)],
  ['PROYEK','',s.useCases.length,'','','',c.uaw,c.uucw,n2(c.ucp),n2(c.pm),n2(c.duration),n2(c.mandays),n2(c.man),Math.round(c.cost)],
  [],
  ['Catatan','Tiap modul dihitung berdiri sendiri memakai TCF dan ECF proyek. Jumlah modul tidak harus sama dengan angka proyek karena durasi memakai akar pangkat tiga. Biaya tetap dibagi menurut porsi UUCW.'],
 ]});

 const faktor=(daftar,label,jumlah,hasil,rumus)=>({name:label,columns:['Kode','Nama','Deskripsi','Assigned Value','Bobot','Hasil'],rows:[
  ...daftar.map(f=>[f.id,f.name,f.desc,num(f.rating),num(f.weight),n2(num(f.rating)*num(f.weight))]),
  [],
  [`TOTAL ${jumlah}`,'','','','',n2(hasil)],
  [rumus[0],'','','','',n3(rumus[1])],
 ]});
 sheets.push(faktor(s.tf,'Faktor Teknis','TF',c.tf,['TCF = 0,6 + 0,01 × TF',c.tcf]));
 sheets.push(faktor(s.ef,'Faktor Lingkungan','EF',c.ef,['ECF = 1,4 − 0,03 × EF',c.ecf]));

 sheets.push({name:'Perhitungan',columns:['Tahap','Rumus','Nilai'],rows:[
  ['UAW','Σ (jumlah actor × bobot)',c.uaw],
  ['UUCW','Σ bobot kompleksitas use case',c.uucw],
  ['UUCP','UAW + UUCW',c.uu],
  ['TF','Σ (assigned value × bobot)',n2(c.tf)],
  ['TCF','0,6 + 0,01 × TF',n3(c.tcf)],
  ['EF','Σ (assigned value × bobot)',n2(c.ef)],
  ['ECF','1,4 − 0,03 × EF',n3(c.ecf)],
  ['UCP','UUCP × TCF × ECF',n2(c.ucp)],
  ['Person Hours','UCP × PHM',n2(c.ph)],
  ['Person-Month','PH ÷ (jam/hari × hari/bulan)',n2(c.pm)],
  ['Durasi (bulan)','3 × PM^(1/3)',n2(c.duration)],
  ['Kebutuhan FTE','PM ÷ target durasi',n2(c.fte)],
  [],
  ['Mandays','PM × durasi × hari kerja',n2(c.mandays)],
  ['Man','Mandays ÷ hari durasi project',n2(c.man)],
  ['Working Days (custom)','masukan manual',num(s.custom.workingDays)],
  ['Hari Durasi Project','masukan manual',num(s.custom.projectDays)],
 ]});

 sheets.push({name:'Fase',columns:['Fase','Bobot (%)','Durasi (bulan)'],rows:[
  ...c.phase.map(p=>[p.name,num(p.weight),n2(p.duration)]),
  [],
  ['TOTAL',n2(c.phaseWeight),n2(c.duration)],
 ]});

 sheets.push({name:'Staffing dan Biaya',columns:['Peran','Rate per Bulan','FTE','Alokasi (%)','FTE Efektif','Biaya (Rp)'],rows:[
  ...s.roles.map(r=>[r.name,num(r.rate),num(r.fte),num(r.allocation),n2(num(r.fte)*num(r.allocation)/100),Math.round(num(r.rate)*num(r.fte)*num(r.allocation)/100*c.duration)]),
  [],
  ['Subtotal sumber daya','','','','',Math.round(c.resourceCost)],
  ...extraKeys.map(([k,l])=>[l,'','','','',Math.round(num(s.extras[k]))]),
  ['Subtotal biaya lain','','','','',Math.round(c.extraCost)],
  [],
  ['TOTAL BIAYA','','','','',Math.round(c.cost)],
 ]});

 sheets.push({name:'Peringatan',columns:['Tingkat','Keterangan'],rows:
  issues.length?issues.map(i=>[i.level==='error'?'Error':'Perlu diperiksa',i.message]):[['—','Tidak ada peringatan.']]});

 return {filename:namaBerkas(s,'Data'),sheets};
}

// ----------------------------------------------------------------- Word ----
// Ringkasan hasil akhir untuk dibaca, bukan untuk dihitung ulang.
export function specWord(s,c,issues){
 const blocks=[];
 const errors=issues.filter(i=>i.level==='error');

 blocks.push({type:'heading',text:'Identitas Proyek'});
 blocks.push({type:'table',columns:['Keterangan','Isi'],rows:[
  ['Kode Proyek',s.project.code||'—'],
  ['Nama Proyek',s.project.name||'—'],
  ['Sponsor',s.project.sponsor||'—'],
  ['Business Owner',s.project.owner||'—'],
  ['Project Manager',s.project.manager||'—'],
  ['Periode',[s.project.start,s.project.target].filter(Boolean).join(' s.d. ')||'—'],
  ['Status',s.project.status],
 ]});
 if(s.project.description)blocks.push({type:'paragraph',text:s.project.description});

 blocks.push({type:'heading',text:'Ringkasan Hasil Estimasi'});
 blocks.push({type:'table',columns:['Besaran','Nilai','Keterangan'],rows:[
  ['Use Case Point',angka(n2(c.ucp)),'UUCP × TCF × ECF'],
  ['Effort',`${angka(n2(c.pm))} person-month`,`setara ${angka(n2(c.ph))} person-hour`],
  ['Durasi',`${angka(n2(c.duration))} bulan`,'3 × PM^(1/3)'],
  ['Kebutuhan Tim',`${Number.isFinite(c.fte)?Math.ceil(c.fte):0} FTE`,`terhadap target ${angka(num(s.params.targetMonths))} bulan`],
  ['Mandays',angka(n2(c.mandays)),`${angka(num(s.custom.workingDays))} hari kerja per bulan`],
  ['Man',angka(n2(c.man)),`terhadap ${angka(num(s.custom.projectDays))} hari durasi project`],
  ['Total Biaya',rupiah(c.cost),`sumber daya ${rupiah(c.resourceCost)} + lainnya ${rupiah(c.extraCost)}`],
 ]});

 blocks.push({type:'heading',text:'Rantai Perhitungan'});
 blocks.push({type:'table',columns:['Tahap','Nilai','Dasar'],rows:[
  ['UAW',angka(c.uaw),`${s.actors.length} actor`],
  ['UUCW',angka(c.uucw),`${s.useCases.length} use case`],
  ['UUCP',angka(c.uu),'UAW + UUCW'],
  ['TCF',angka(n3(c.tcf)),`TF ${angka(n2(c.tf))}`],
  ['ECF',angka(n3(c.ecf)),`EF ${angka(n2(c.ef))}`],
  ['UCP',angka(n2(c.ucp)),'UUCP × TCF × ECF'],
 ]});

 blocks.push({type:'heading',text:'Distribusi Fase'});
 blocks.push({type:'table',columns:['Fase','Bobot','Durasi'],rows:
  c.phase.map(p=>[p.name,`${angka(num(p.weight))}%`,`${angka(n2(p.duration))} bulan`])
   .concat([['Total',`${angka(n2(c.phaseWeight))}%`,`${angka(n2(c.duration))} bulan`]])});

 if(s.modules.length){
  blocks.push({type:'heading',text:'Rekap per Modul Aplikasi'});
  blocks.push({type:'table',columns:['Modul','Use Case','UUCW','UCP','Effort','Durasi','Biaya'],rows:
   c.moduleRows.map(r=>[[r.code,r.name].filter(Boolean).join(' · '),String(r.count),angka(r.uucw),angka(n2(r.ucp)),`${angka(n2(r.pm))} PM`,`${angka(n2(r.duration))} bulan`,rupiah(r.cost)])});
  blocks.push({type:'paragraph',text:'Tiap modul dihitung sebagai estimasi yang berdiri sendiri: UAW dari actor yang dirujuk use case di dalamnya dan UUCW dari use case itu, memakai TCF serta ECF proyek. Jumlah seluruh modul karena itu tidak harus sama dengan angka proyek, sebab durasi memakai akar pangkat tiga sehingga memecah effort menurunkan durasi masing-masing bagian. Biaya adalah pengecualian: tetap dibagi menurut porsi UUCW karena peran pada staffing ditetapkan untuk proyek.'});
 }

 blocks.push({type:'heading',text:'Rencana Sumber Daya'});
 blocks.push({type:'table',columns:['Peran','FTE','Alokasi','Biaya'],rows:
  s.roles.map(r=>[r.name,angka(num(r.fte)),`${angka(num(r.allocation))}%`,rupiah(num(r.rate)*num(r.fte)*num(r.allocation)/100*c.duration)])
   .concat([['Total sumber daya','','',rupiah(c.resourceCost)]])});

 blocks.push({type:'heading',text:'Penilaian Kelayakan'});
 blocks.push({type:'table',columns:['Aspek','Penilaian','Pertanyaan Kunci'],rows:[
  ['Teknis',s.feas.technical,'Can we build it?'],
  ['Ekonomi',s.feas.economic,'Should we build it?'],
  ['Organisasi',s.feas.organizational,'Will they use it?'],
 ]});
 if(s.feas.notes)blocks.push({type:'paragraph',text:s.feas.notes});

 blocks.push({type:'heading',text:'Catatan Pemeriksaan'});
 if(issues.length){
  if(errors.length)blocks.push({type:'paragraph',text:`Terdapat ${errors.length} masalah yang menghalangi estimasi dianggap valid. Perbaiki lebih dulu sebelum angka pada laporan ini dipakai sebagai dasar keputusan.`});
  blocks.push({type:'bullets',items:issues.map(i=>`${i.level==='error'?'[Error]':'[Perlu diperiksa]'} ${i.message}`)});
 }else{
  blocks.push({type:'paragraph',text:'Tidak ada peringatan. Seluruh aturan konsistensi terpenuhi: bobot fase berjumlah 100%, kode use case unik, dan parameter effort terisi.'});
 }

 blocks.push({type:'paragraph',text:`Laporan dihasilkan otomatis oleh UCP Manager pada ${tanggal()}. Rincian data masukan dan keluaran tersedia pada laporan Excel.`});

 return {
  filename:namaBerkas(s,'Ringkasan'),
  title:s.project.name||'Laporan Estimasi Proyek',
  subtitle:[s.project.code,'Estimasi Use Case Point',s.project.status].filter(Boolean).join(' · '),
  blocks
 };
}
