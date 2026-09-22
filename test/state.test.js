import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,newState,nextCode,seed,STATE_VERSION,defaultTF,defaultEF} from '../src/state.js';
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

test('rating di luar skala dijepit saat dimuat', () => {
 const s=normalize({...newState(),tf:[{id:'T1',rating:999},{id:'T2',rating:-5}]});
 assert.equal(s.tf.find(f=>f.id==='T1').rating,5);
 assert.equal(s.tf.find(f=>f.id==='T2').rating,0);
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
