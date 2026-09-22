import {actorWeights,complexity,clamp,num,deriveComplexity,extraKeys,RATING_MIN,RATING_MAX} from './calc.js';

export const STORAGE_KEY='ucp-state';
export const STATE_VERSION=2;
export const uid=()=>Math.random().toString(36).slice(2,9);
export const statuses=['Draft','Assessment','Calculated','Reviewed','Approved','Baselined'];
export const levels=['Low','Medium','High'];

// Bobot TF/EF ditentukan oleh model UCP, bukan oleh user. Daftar ini selalu
// menjadi sumber kebenaran saat memuat data supaya bobot tidak bisa rusak.
// Setiap baris: [kode, nama, deskripsi, bobot model, assigned value bawaan].
// Bobot ditetapkan model UCP dan tidak pernah diambil dari data tersimpan;
// assigned value bawaan hanya berlaku untuk proyek baru dan untuk faktor yang
// tidak punya nilai tersimpan, sehingga proyek yang sudah ada tidak berubah.
export const defaultTF=[['T1','Distributed system','Kemampuan sistem bekerja pada beberapa lokasi/komponen.',2,5],['T2','Response/performance','Kebutuhan performa dan waktu respons.',1,4],['T3','End-user efficiency','Efisiensi pengguna akhir.',1,2],['T4','Complex internal processing','Kompleksitas pemrosesan internal.',1,4],['T5','Reusable code','Kebutuhan komponen reusable.',1,2],['T6','Easy to install','Kemudahan instalasi.',.5,5],['T7','Easy to use','Kemudahan penggunaan.',.5,3],['T8','Portable','Kebutuhan portabilitas.',2,3],['T9','Easy to change','Kemudahan perubahan.',1,3],['T10','Concurrent use','Kebutuhan concurrency.',1,2],['T11','Security','Kebutuhan keamanan.',1,2],['T12','Direct access for third parties','Akses langsung pihak ketiga.',1,5],['T13','Special training','Kebutuhan pelatihan khusus.',1,3]];
export const defaultEF=[['E1','Familiarity with development process','Pengalaman dengan proses pengembangan.',1.5,4],['E2','Application experience','Pengalaman pada domain aplikasi.',.5,3],['E3','OO experience','Pengalaman object-oriented.',1,4],['E4','Lead analyst capability','Kapabilitas lead analyst.',.5,4],['E5','Motivation','Motivasi tim.',1,3],['E6','Stable requirements','Stabilitas requirement.',2,4],['E7','Part-time workers','Proporsi pekerja part-time.',-1,0],['E8','Difficult programming language','Tingkat kesulitan bahasa/platform.',-1,3]];
const factors=def=>def.map(x=>({id:x[0],name:x[1],desc:x[2],weight:x[3],rating:x[4]}));

export const seed={
 version:STATE_VERSION,
 project:{code:'UCP-001',name:'Sistem Informasi Alat dan Bahan',sponsor:'',owner:'',manager:'',description:'Estimasi proyek berbasis Use Case Point.',start:'',target:'',status:'Draft'},
 actors:[{id:'a1',name:'Mahasiswa',type:'Simple',qty:3},{id:'a2',name:'Admin',type:'Average',qty:2},{id:'a3',name:'External API',type:'Complex',qty:1}],
 modules:[],
 useCases:[{id:'u1',code:'UC-001',name:'Login',actor:'Mahasiswa',transactions:3,type:'Simple',override:false,module:''},{id:'u2',code:'UC-002',name:'Kelola Data',actor:'Admin',transactions:7,type:'Average',override:false,module:''}],
 tf:factors(defaultTF),ef:factors(defaultEF),
 params:{phm:20,hours:8,days:22,targetMonths:10},
 phases:[{name:'Planning',weight:15},{name:'Analysis',weight:20},{name:'Design',weight:35},{name:'Implementation',weight:30}],
 roles:[{id:'r1',name:'Project Manager',rate:15000000,fte:1,allocation:20},{id:'r2',name:'Business Analyst',rate:12000000,fte:1,allocation:80},{id:'r3',name:'System Analyst',rate:15000000,fte:1,allocation:100},{id:'r4',name:'Developer',rate:12000000,fte:2,allocation:100},{id:'r5',name:'QA Engineer',rate:10000000,fte:1,allocation:50}],
 extras:{infrastructure:0,license:0,training:0,migration:0},
 custom:{workingDays:22,projectDays:120},
 feas:{technical:'Medium',economic:'Medium',organizational:'Medium',notes:''}
};
export const newState=()=>structuredClone(seed);

const str=(v,fallback='')=>typeof v==='string'?v:fallback;
const pick=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
const arr=v=>Array.isArray(v)?v:[];

// normalize() harus total: apa pun bentuk data yang masuk, hasilnya adalah
// state yang bisa dirender. Ini yang mencegah satu key hilang membuat aplikasi
// blank dan ter-brick karena state rusak ikut tersimpan.
export function normalize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return newState();
 const d=seed;
 const legacy=num(raw.version,1)<2;
 const project={...d.project};
 for(const k of Object.keys(d.project))project[k]=str(raw.project?.[k],d.project[k]);
 project.status=pick(project.status,statuses,'Draft');

 const actors=arr(raw.actors).map(a=>({id:str(a?.id)||uid(),name:str(a?.name,'Actor'),type:pick(a?.type,Object.keys(actorWeights),'Simple'),qty:clamp(a?.qty,0,9999)}));

 // Modul bersifat opsional. Kuncinya dibuat di klien dan ikut tersimpan,
 // bukan memakai id baris database, karena baris anak ditulis ulang setiap
 // kali menyimpan sehingga id barisnya berubah dan rujukan use case putus.
 const usedKeys=new Set();
 const modules=arr(raw.modules).map(m=>{
  let key=str(m?.key);
  while(!key||usedKeys.has(key))key=uid();
  usedKeys.add(key);
  return {key,code:str(m?.code),name:str(m?.name,'Modul')};
 });

 const useCases=arr(raw.useCases).map(u=>{
  const transactions=clamp(u?.transactions,0,999);
  const type=pick(u?.type,complexity,deriveComplexity(transactions));
  // Migrasi v1: data lama menyimpan override tanpa pernah memakainya. Use case
  // yang tipenya berbeda dari klasifikasi transaksi dikunci sebagai override
  // supaya estimasi yang sudah ada tidak berubah angkanya secara diam-diam.
  const override=legacy?type!==deriveComplexity(transactions):!!u?.override;
  // rujukan ke modul yang sudah dihapus dilepas, bukan dibiarkan menggantung
  const module=usedKeys.has(str(u?.module))?str(u?.module):'';
  return {id:str(u?.id)||uid(),code:str(u?.code),name:str(u?.name,'Use Case'),actor:str(u?.actor),transactions,type,override,module};
 });

 const ratings=(def,stored)=>{const by=new Map(arr(stored).map(x=>[str(x?.id),x]));return def.map(x=>({id:x[0],name:x[1],desc:x[2],weight:x[3],rating:clamp(by.get(x[0])?.rating??x[4],RATING_MIN,RATING_MAX)}))};
 const params={
  phm:clamp(raw.params?.phm??d.params.phm,0,1000),
  hours:clamp(raw.params?.hours??d.params.hours,1,24),
  days:clamp(raw.params?.days??d.params.days,1,31),
  targetMonths:clamp(raw.params?.targetMonths??d.params.targetMonths,0,600)
 };
 const phases=arr(raw.phases).length?arr(raw.phases).map(p=>({name:str(p?.name,'Phase'),weight:clamp(p?.weight,0,100)})):structuredClone(d.phases);
 const roles=arr(raw.roles).map(r=>({id:str(r?.id)||uid(),name:str(r?.name,'Role'),rate:clamp(r?.rate,0,1e12),fte:clamp(r?.fte,0,999),allocation:clamp(r?.allocation,0,100)}));
 const extras={};
 for(const [k] of extraKeys)extras[k]=clamp(raw.extras?.[k],0,1e12);
 const custom={
  workingDays:clamp(raw.custom?.workingDays??d.custom.workingDays,1,31),
  projectDays:clamp(raw.custom?.projectDays??d.custom.projectDays,1,1e5)
 };
 const feas={
  technical:pick(raw.feas?.technical,levels,'Medium'),
  economic:pick(raw.feas?.economic,levels,'Medium'),
  organizational:pick(raw.feas?.organizational,levels,'Medium'),
  notes:str(raw.feas?.notes)
 };
 const out={version:STATE_VERSION,project,actors,modules,useCases,tf:ratings(defaultTF,raw.tf),ef:ratings(defaultEF,raw.ef),params,phases,roles,extras,custom,feas};
 if(typeof raw.savedAt==='string')out.savedAt=raw.savedAt;
 // Id baris database dibawa apa adanya bila ada, supaya state hasil muat
 // dari API tetap tahu proyek mana yang sedang dibuka.
 if(Number.isInteger(raw.id))out.id=raw.id;
 return out;
}

// Sejak penyimpanan pindah ke MySQL, localStorage tidak lagi menjadi sumber
// data. Perannya tinggal dua: menampung draft ketika penyimpanan ke database
// gagal, dan menyimpan data dari versi lama yang belum dipindahkan.

const DRAFT_PREFIX='ucp-draft-';
const draftKey=id=>`${DRAFT_PREFIX}${id}`;

export function saveDraft(id,s){
 try{localStorage.setItem(draftKey(id),JSON.stringify({savedAt:new Date().toISOString(),state:s}));return true}catch{return false}
}
export function readDraft(id){
 try{
  const raw=localStorage.getItem(draftKey(id));
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||!parsed.state)return null;
  return {savedAt:typeof parsed.savedAt==='string'?parsed.savedAt:null,state:normalize(parsed.state)};
 }catch{return null}
}
export function clearDraft(id){try{localStorage.removeItem(draftKey(id))}catch{}}

// Data dari versi sebelum database. Dibaca sekali agar bisa ditawarkan
// pindah ke MySQL, supaya pekerjaan yang sudah ada tidak menjadi tidak
// terjangkau hanya karena tempat penyimpanannya berubah.
export function legacyState(){
 try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return null;
  const s=normalize(JSON.parse(raw));
  return {name:s.project.name,code:s.project.code,actors:s.actors.length,useCases:s.useCases.length,state:s};
 }catch{return null}
}
export function readStored(){try{return localStorage.getItem(STORAGE_KEY)}catch{return null}}
export function clearStored(){try{localStorage.removeItem(STORAGE_KEY)}catch{}}

// Dipakai layar pemulihan: membersihkan seluruh jejak lokal, termasuk draft
// proyek mana pun, tanpa menyentuh data yang sudah aman di database.
export function clearAllLocal(){
 try{
  clearStored();
  for(const key of Object.keys(localStorage))if(key.startsWith(DRAFT_PREFIX))localStorage.removeItem(key);
 }catch{}
}

// Proyek baru berangkat dari kanvas kosong: tanpa actor dan use case contoh,
// tapi tetap membawa 13 TF, 8 EF, distribusi fase dan parameter baku yang
// memang bagian dari model, bukan data proyek.
export function emptyProject(){
 const s=newState();
 s.project={...s.project,code:'UCP-001',name:'Proyek Baru',description:'',sponsor:'',owner:'',manager:'',start:'',target:'',status:'Draft'};
 s.actors=[];
 s.useCases=[];
 s.modules=[];
 return s;
}

// Kode use case diturunkan dari sufiks tertinggi yang sudah dipakai, bukan dari
// panjang array, agar penghapusan di tengah tidak menghasilkan kode duplikat.
export function nextCode(useCases){
 const max=useCases.reduce((m,u)=>{const n=/^UC-(\d+)$/i.exec((u.code||'').trim());return n?Math.max(m,Number(n[1])):m},0);
 return `UC-${String(max+1).padStart(3,'0')}`;
}

// Kode modul mengikuti pola yang sama dengan kode use case: diturunkan dari
// sufiks tertinggi yang sudah dipakai agar penghapusan di tengah daftar tidak
// menghasilkan kode kembar.
export function nextModuleCode(modules){
 const max=modules.reduce((m,x)=>{const n=/^M-?(\d+)$/i.exec((x.code||'').trim());return n?Math.max(m,Number(n[1])):m},0);
 return `M${max+1}`;
}
