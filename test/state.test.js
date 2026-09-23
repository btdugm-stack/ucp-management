import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,newState,emptyProject,nextCode,nextModuleCode,newUseCase,newModule,deleteModule,moduleImpact,resolveActiveModule,useCasesInView,seed,STATE_VERSION,defaultTF,defaultEF} from '../src/state.js';
import {calculate,deriveComplexity} from '../src/calc.js';

// normalize() adalah satu-satunya pintu masuk data dari localStorage maupun
// file import, jadi sifat totalnya diuji terhadap segala bentuk masukan buruk.
test('normalize() tidak pernah melempar untuk masukan apa pun', () => {
 const junk=[null,undefined,0,'',NaN,'teks biasa',[],[1,2,3],true,{},{project:null},{actors:'bukan array'},{tf:{}},{params:'x'}];
 for(const raw of junk){
  const s=normalize(raw);
  assert.ok(s&&typeof s==='object',`gagal untuk ${JSON.stringify(raw)}`);
  assert.ok(Array.isArray(s.actors)&&Array.isArray(s.useCases)&&Array.isArray(s.phases));
  assert.equal(s.tf.length,defaultTF.length);
  assert.equal(s.ef.length,defaultEF.length);
  // state hasil normalisasi harus selalu bisa dihitung
  const c=calculate(s);
  assert.ok(Number.isFinite(c.ucp)&&Number.isFinite(c.cost));
 }
});

test('normalize() memulihkan state yang kehilangan key', () => {
 const broken={...newState()};
 delete broken.tf;delete broken.feas;delete broken.extras;delete broken.params;
 const s=normalize(broken);
 assert.equal(s.tf.length,13);
 assert.equal(s.feas.technical,'Medium');
 assert.equal(s.extras.infrastructure,0);
 assert.equal(s.params.hours,8);
});

test('bobot TF/EF selalu diambil dari model, bukan dari data tersimpan', () => {
 const tampered={...newState(),tf:[{id:'T1',weight:9999,rating:5}]};
 const s=normalize(tampered);
 assert.equal(s.tf.find(f=>f.id==='T1').weight,2);
 assert.equal(s.tf.find(f=>f.id==='T1').rating,5);
});

test('rating dijepit ke rentang -5 sampai 5 saat dimuat', () => {
 const s=normalize({...newState(),tf:[{id:'T1',rating:999},{id:'T2',rating:-999},{id:'T3',rating:-4},{id:'T4',rating:'rusak'}]});
 assert.equal(s.tf.find(f=>f.id==='T1').rating,5);
 assert.equal(s.tf.find(f=>f.id==='T2').rating,-5);
 assert.equal(s.tf.find(f=>f.id==='T3').rating,-4,'nilai negatif yang wajar dipertahankan');
 assert.equal(s.tf.find(f=>f.id==='T4').rating,0,'isian rusak jatuh ke 0, bukan ke batas bawah');
});

test('parameter nol dijepit ke batas aman saat dimuat', () => {
 const s=normalize({...newState(),params:{phm:20,hours:0,days:0,targetMonths:-4}});
 assert.equal(s.hours??s.params.hours,1);
 assert.equal(s.params.days,1);
 assert.equal(s.params.targetMonths,0);
 assert.ok(Number.isFinite(calculate(s).pm));
});

test('migrasi v1 mempertahankan angka estimasi yang sudah ada', () => {
 // Data lama: type Simple padahal 8 transaksi. Sebelum migrasi UUCW = 5.
 const legacy={...newState(),version:undefined,useCases:[{id:'1',code:'UC-001',name:'Lama',actor:'',transactions:8,type:'Simple',override:false}]};
 assert.equal(deriveComplexity(8),'Complex');
 const s=normalize(legacy);
 assert.equal(s.version,STATE_VERSION);
 assert.equal(s.useCases[0].override,true,'ketidakcocokan lama harus dikunci sebagai override');
 assert.equal(calculate(s).uucw,5,'angka lama tidak boleh berubah diam-diam');
});

test('data v2 menghormati override apa adanya', () => {
 const s=normalize({...newState(),version:2,useCases:[{id:'1',code:'UC-001',transactions:8,type:'Simple',override:false}]});
 assert.equal(s.useCases[0].override,false);
 assert.equal(calculate(s).uucw,15,'tanpa override, bobot mengikuti transaksi');
});

test('nextCode() tidak menghasilkan kode yang sudah dipakai', () => {
 assert.equal(nextCode([]),'UC-001');
 assert.equal(nextCode([{code:'UC-001'},{code:'UC-002'},{code:'UC-003'}]),'UC-004');
 // kasus yang dulu bentrok: hapus di tengah lalu tambah
 assert.equal(nextCode([{code:'UC-001'},{code:'UC-003'}]),'UC-004');
 assert.equal(nextCode([{code:'CUSTOM'},{code:''}]),'UC-001');
 assert.equal(nextCode([{code:'UC-012'},{code:'UC-007'}]),'UC-013');
});

test('status dan level di luar daftar jatuh ke nilai aman', () => {
 const s=normalize({...newState(),project:{status:'Peretas'},feas:{technical:'Ekstrem',economic:'High',organizational:null,notes:42}});
 assert.equal(s.project.status,'Draft');
 assert.equal(s.feas.technical,'Medium');
 assert.equal(s.feas.economic,'High');
 assert.equal(s.feas.organizational,'Medium');
 assert.equal(s.feas.notes,'');
});

test('setiap actor, use case, dan role selalu punya id unik', () => {
 const s=normalize({...newState(),actors:[{name:'a'},{name:'b'}],roles:[{name:'r'},{name:'r2'}],useCases:[{name:'u'},{name:'u2'}]});
 for(const list of [s.actors,s.roles,s.useCases]){
  const ids=list.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.every(Boolean));
 }
});

test('seed sendiri lolos normalisasi tanpa berubah', () => {
 assert.deepEqual(normalize(structuredClone(seed)),structuredClone(seed));
});

test('emptyProject() memberi kanvas kosong tapi tetap membawa model UCP', () => {
 const s=emptyProject();
 assert.deepEqual(s.actors,[]);
 assert.deepEqual(s.useCases,[]);
 assert.equal(s.tf.length,13);
 assert.equal(s.ef.length,8);
 assert.equal(s.phases.reduce((a,p)=>a+p.weight,0),100);
 assert.equal(s.project.status,'Draft');
 assert.ok(!s.project.description);
 const c=calculate(s);
 assert.equal(c.uaw,0);
 assert.equal(c.uucw,0);
 assert.equal(c.ucp,0);
 assert.ok(Number.isFinite(c.cost));
});

test('proyek kosong lolos normalisasi tanpa berubah bentuk', () => {
 const s=emptyProject();
 assert.deepEqual(normalize(structuredClone(s)),structuredClone(s));
});

test('savedAt dipertahankan lewat normalisasi bila berupa string', () => {
 const stamp='2026-09-22T04:00:00.000Z';
 assert.equal(normalize({...newState(),savedAt:stamp}).savedAt,stamp);
 assert.ok(!('savedAt' in normalize({...newState(),savedAt:12345})));
 assert.ok(!('savedAt' in normalize(newState())));
});

test('parameter kalkulasi custom dijepit saat dimuat', () => {
 assert.deepEqual(normalize({}).custom,{workingDays:22,projectDays:120});
 assert.deepEqual(normalize({custom:{workingDays:999,projectDays:-3}}).custom,{workingDays:31,projectDays:1});
 assert.deepEqual(normalize({custom:'rusak'}).custom,{workingDays:22,projectDays:120});
 assert.deepEqual(emptyProject().custom,{workingDays:22,projectDays:120});
});

test('assigned value bawaan dipakai untuk faktor yang tidak punya nilai tersimpan', () => {
 // hanya T1 yang tersimpan; sisanya jatuh ke bawaan masing-masing, bukan ke 3
 const s=normalize({...newState(),tf:[{id:'T1',rating:1}]});
 assert.equal(s.tf.find(f=>f.id==='T1').rating,1);
 assert.equal(s.tf.find(f=>f.id==='T6').rating,5);
 assert.equal(s.tf.find(f=>f.id==='T3').rating,2);
 assert.equal(s.ef.find(f=>f.id==='E7').rating,0);
 assert.equal(s.ef.find(f=>f.id==='E1').rating,4);
});

test('proyek yang sudah tersimpan tidak ikut berubah oleh bawaan baru', () => {
 const tersimpan={...newState(),tf:defaultTF.map(x=>({id:x[0],rating:1})),ef:defaultEF.map(x=>({id:x[0],rating:1}))};
 const s=normalize(tersimpan);
 assert.ok(s.tf.every(f=>f.rating===1),'nilai tersimpan harus menang atas bawaan');
 assert.ok(s.ef.every(f=>f.rating===1));
});

test('kunci modul selalu unik dan bertahan lintas normalisasi', () => {
 const s=normalize({...newState(),modules:[{key:'a',name:'Satu'},{key:'a',name:'Kembar'},{name:'Tanpa kunci'}]});
 const keys=s.modules.map(m=>m.key);
 assert.equal(new Set(keys).size,3);
 assert.ok(keys.every(Boolean));
 assert.equal(s.modules[0].key,'a','kunci yang sudah sah dipertahankan');
 assert.deepEqual(normalize(s).modules.map(m=>m.key),keys,'normalisasi ulang tidak mengubah kunci');
});

test('rujukan use case ke modul yang hilang dilepas', () => {
 const s=normalize({...newState(),
  modules:[{key:'ada',code:'M1',name:'Ada'}],
  useCases:[{code:'UC-1',module:'ada'},{code:'UC-2',module:'sudah-dihapus'},{code:'UC-3'}]});
 assert.deepEqual(s.useCases.map(u=>u.module),['ada','','']);
});

test('modules selalu berupa array apa pun bentuk masukannya', () => {
 for(const raw of [undefined,null,'x',{},{modules:'bukan array'},{modules:[null,5,'y']}]){
  const s=normalize(raw);
  assert.ok(Array.isArray(s.modules));
  assert.ok(s.modules.every(m=>typeof m.key==='string'&&m.key.length>0));
 }
});

test('nextModuleCode() tidak menghasilkan kode kembar', () => {
 assert.equal(nextModuleCode([]),'M1');
 assert.equal(nextModuleCode([{code:'M1'},{code:'M2'}]),'M3');
 assert.equal(nextModuleCode([{code:'M1'},{code:'M3'}]),'M4');
 assert.equal(nextModuleCode([{code:'Lain'}]),'M1');
});

test('use case baru mewarisi modul yang sedang aktif', () => {
 const kosong=newUseCase([],'');
 assert.equal(kosong.module,'');
 assert.equal(kosong.code,'UC-001');
 const ke=newUseCase([{code:'UC-001'}],'kunci-modul');
 assert.equal(ke.module,'kunci-modul');
 assert.equal(ke.code,'UC-002','penomoran tetap berjalan');
 assert.equal(newUseCase([],null).module,'','kunci tidak sah diperlakukan sebagai tanpa modul');
 assert.equal(newUseCase([],undefined).module,'');
});

test('newModule() memberi kunci unik, kode berurutan, dan nama berbeda', () => {
 const a=newModule([]);
 assert.equal(a.code,'M1');
 assert.equal(a.name,'Modul M1');
 assert.ok(a.key);
 const b=newModule([a]);
 assert.equal(b.code,'M2');
 assert.equal(b.name,'Modul M2');
 assert.notEqual(a.key,b.key);
 // dua modul baru berturut-turut tidak boleh memicu peringatan nama kembar
 assert.notEqual(a.name,b.name);
 assert.equal(newModule([],'Autentikasi').name,'Autentikasi','nama pilihan pengguna dihormati');
});

test('pandangan aktif selalu menunjuk modul yang ada', () => {
 const modules=[{key:'a',code:'M1',name:'A'},{key:'b',code:'M2',name:'B'}];
 const terpasang=[{module:'a'},{module:'b'}];
 const adaLepas=[{module:'a'},{module:''}];
 assert.equal(resolveActiveModule(modules,terpasang,'a'),'a','pilihan sah dipertahankan');
 assert.equal(resolveActiveModule(modules,terpasang,'sudah-dihapus'),'a','jatuh ke modul pertama');
 assert.equal(resolveActiveModule(modules,terpasang,null),'a','tanpa pilihan berarti modul pertama');
 assert.equal(resolveActiveModule(modules,terpasang,''),'a','pandangan tanpa modul ditutup bila tidak ada yang lepas');
 assert.equal(resolveActiveModule(modules,adaLepas,''),'','pandangan tanpa modul terbuka bila ada yang lepas');
 assert.equal(resolveActiveModule([],[{module:''}],''),'','tanpa modul sama sekali');
 assert.equal(resolveActiveModule(null,null,'a'),'');
});

test('daftar use case disaring mengikuti pandangan aktif', () => {
 const modules=[{key:'a',code:'M1',name:'A'},{key:'b',code:'M2',name:'B'}];
 const cases=[{code:'UC-1',module:'a'},{code:'UC-2',module:'a'},{code:'UC-3',module:'b'},{code:'UC-4',module:''},{code:'UC-5',module:'hantu'}];
 assert.deepEqual(useCasesInView(modules,cases,'a').map(u=>u.code),['UC-1','UC-2']);
 assert.deepEqual(useCasesInView(modules,cases,'b').map(u=>u.code),['UC-3']);
 // rujukan ke modul yang hilang ikut terbaca sebagai tanpa modul
 assert.deepEqual(useCasesInView(modules,cases,'').map(u=>u.code),['UC-4','UC-5']);
 // tanpa modul sama sekali, seluruhnya ditampilkan
 assert.deepEqual(useCasesInView([],cases,'').map(u=>u.code),['UC-1','UC-2','UC-3','UC-4','UC-5']);
 assert.deepEqual(useCasesInView(null,null,''),[]);
});

test('menghapus modul ikut menghapus use case di dalamnya', () => {
 const s=newState();
 s.modules=[{key:'a',code:'M1',name:'Satu'},{key:'b',code:'M2',name:'Dua'}];
 s.useCases=[
  {id:'1',code:'UC-001',name:'a',actor:'',transactions:3,type:'Simple',override:false,module:'a'},
  {id:'2',code:'UC-002',name:'b',actor:'',transactions:3,type:'Simple',override:false,module:'a'},
  {id:'3',code:'UC-003',name:'c',actor:'',transactions:3,type:'Simple',override:false,module:'b'},
  {id:'4',code:'UC-004',name:'d',actor:'',transactions:3,type:'Simple',override:false,module:''},
 ];
 const setelah=deleteModule(s,'a');
 assert.deepEqual(setelah.modules.map(m=>m.key),['b']);
 assert.deepEqual(setelah.useCases.map(u=>u.code),['UC-003','UC-004'],'hanya isi modul a yang hilang');
 assert.equal(s.useCases.length,4,'state semula tidak berubah');
});

test('menghapus modul tidak menyentuh use case tanpa modul maupun modul lain', () => {
 const s=newState();
 s.modules=[{key:'a',code:'M1',name:'Satu'}];
 s.useCases=[{id:'1',code:'UC-001',name:'lepas',actor:'',transactions:3,type:'Simple',override:false,module:''}];
 const setelah=deleteModule(s,'a');
 assert.deepEqual(setelah.modules,[]);
 assert.deepEqual(setelah.useCases.map(u=>u.code),['UC-001']);
});

test('menghapus modul tidak meninggalkan rujukan menggantung', () => {
 const s=newState();
 s.modules=[{key:'a',code:'M1',name:'Satu'}];
 s.useCases=[{id:'1',code:'UC-001',name:'a',actor:'',transactions:3,type:'Simple',override:false,module:'a'}];
 const setelah=deleteModule(s,'a');
 const kunci=new Set(setelah.modules.map(m=>m.key));
 assert.ok(setelah.useCases.every(u=>!u.module||kunci.has(u.module)));
 // normalisasi ulang tidak mengubah apa pun lagi
 assert.deepEqual(normalize(setelah).useCases.length,setelah.useCases.length);
});

test('kunci kosong atau tidak dikenal tidak menghapus apa pun', () => {
 const s=newState();
 s.modules=[{key:'a',code:'M1',name:'Satu'}];
 s.useCases=[{id:'1',code:'UC-001',name:'a',actor:'',transactions:3,type:'Simple',override:false,module:'a'}];
 assert.deepEqual(deleteModule(s,''),s);
 const asing=deleteModule(s,'tidak-ada');
 assert.equal(asing.modules.length,1);
 assert.equal(asing.useCases.length,1);
});

test('moduleImpact melaporkan jumlah use case yang akan ikut terhapus', () => {
 const s=newState();
 s.modules=[{key:'a',code:'M1',name:'Autentikasi'}];
 s.useCases=[
  {id:'1',code:'UC-001',name:'a',actor:'',transactions:3,type:'Simple',override:false,module:'a'},
  {id:'2',code:'UC-002',name:'b',actor:'',transactions:3,type:'Simple',override:false,module:''},
 ];
 const d=moduleImpact(s,'a');
 assert.equal(d.jumlah,1);
 assert.equal(d.label,'M1 \u00b7 Autentikasi');
 assert.deepEqual(d.useCases.map(u=>u.code),['UC-001']);
 assert.equal(moduleImpact(s,'tidak-ada').jumlah,0);
 assert.equal(moduleImpact(s,'tidak-ada').modul,null);
});
