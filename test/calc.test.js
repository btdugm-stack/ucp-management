import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,validate,clamp,div,num,deriveComplexity,effectiveType,ucWeights} from '../src/calc.js';
import {seed,newState} from '../src/state.js';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('helper: num() menolak nilai non-finite', () => {
 assert.equal(num(''),0);
 assert.equal(num('abc'),0);
 assert.equal(num(null),0);
 assert.equal(num(Infinity),0);
 assert.equal(num(NaN,7),7);
 assert.equal(num('12.5'),12.5);
});

test('helper: div() tidak pernah menghasilkan Infinity atau NaN', () => {
 assert.equal(div(10,0),0);
 assert.equal(div(10,''),0);
 assert.equal(div(10,null),0);
 assert.equal(div(10,2),5);
});

test('helper: clamp() mengunci nilai ke rentang', () => {
 assert.equal(clamp(999,0,5),5);
 assert.equal(clamp(-3,0,5),0);
 assert.equal(clamp('4',0,5),4);
 assert.equal(clamp('',0,5),0);
 // dengan batas bawah negatif, isian rusak tetap jatuh ke 0
 assert.equal(clamp('',-5,5),0);
 assert.equal(clamp('rusak',-5,5),0);
 assert.equal(clamp(-99,-5,5),-5);
 assert.equal(clamp(-2.5,-5,5),-2.5);
});

test('deriveComplexity mengikuti ambang UCP standar', () => {
 assert.equal(deriveComplexity(0),'Simple');
 assert.equal(deriveComplexity(3),'Simple');
 assert.equal(deriveComplexity(4),'Average');
 assert.equal(deriveComplexity(7),'Average');
 assert.equal(deriveComplexity(8),'Complex');
 assert.equal(deriveComplexity(100),'Complex');
});

test('effectiveType hanya menghormati type manual saat override aktif', () => {
 assert.equal(effectiveType({transactions:10,type:'Simple',override:false}),'Complex');
 assert.equal(effectiveType({transactions:10,type:'Simple',override:true}),'Simple');
 // override dengan type tidak valid tetap jatuh ke hasil turunan
 assert.equal(effectiveType({transactions:10,type:'Bogus',override:true}),'Complex');
});

test('baseline seed menghasilkan rantai UCP yang benar', () => {
 const c=calculate(seed);
 assert.equal(c.uaw,10);                 // 3x1 + 2x2 + 1x3
 assert.equal(c.uucw,15);                // Simple(5) + Average(10)
 assert.equal(c.uu,25);
 near(c.tf,47);                          // assigned value bawaan x bobot model
 near(c.tcf,1.07);                       // 0.6 + 0.01 x 47
 near(c.ef,21.5);
 near(c.ecf,0.755);                      // 1.4 - 0.03 x 21.5
 near(c.ucp,20.19625);                   // 25 x 1.07 x 0.755
 near(c.ph,403.925);
 near(c.pm,403.925/176);
 near(c.duration,3*Math.cbrt(403.925/176));
});

test('assigned value bawaan sesuai daftar yang ditetapkan', () => {
 const tf=Object.fromEntries(seed.tf.map(f=>[f.id,f.rating]));
 const ef=Object.fromEntries(seed.ef.map(f=>[f.id,f.rating]));
 assert.deepEqual(tf,{T1:5,T2:4,T3:2,T4:4,T5:2,T6:5,T7:3,T8:3,T9:3,T10:2,T11:2,T12:5,T13:3});
 assert.deepEqual(ef,{E1:4,E2:3,E3:4,E4:4,E5:3,E6:4,E7:0,E8:3});
 // hasil kali per baris, sebagai pagar terhadap tertukarnya bobot dan nilai
 near(seed.tf.reduce((a,f)=>a+f.rating*f.weight,0),47);
 near(seed.ef.reduce((a,f)=>a+f.rating*f.weight,0),21.5);
});

test('kapasitas kerja nol menghasilkan 0, bukan Infinity', () => {
 const s={...newState(),params:{phm:20,hours:0,days:22,targetMonths:10}};
 const c=calculate(s);
 for(const k of ['pm','duration','fte','resourceCost','cost'])
  assert.ok(Number.isFinite(c[k]),`${k} tidak finite: ${c[k]}`);
 assert.equal(c.pm,0);
 assert.equal(c.duration,0);
 assert.equal(c.cost,0);
});

test('target durasi nol tidak merusak perhitungan FTE', () => {
 const s={...newState(),params:{...seed.params,targetMonths:0}};
 const c=calculate(s);
 assert.ok(Number.isFinite(c.fte));
 assert.equal(c.fte,0);
});

test('parameter kosong atau berupa string tidak menghasilkan NaN', () => {
 const s={...newState(),params:{phm:'',hours:'x',days:null,targetMonths:undefined}};
 const c=calculate(s);
 for(const [k,v] of Object.entries(c))
  if(typeof v==='number')assert.ok(Number.isFinite(v),`${k} tidak finite: ${v}`);
});

test('rating di luar rentang tidak bisa menggelembungkan UCP', () => {
 const s=newState();
 s.tf=s.tf.map(f=>({...f,rating:999}));
 near(calculate(s).tf,5*14);          // dijepit ke 5, bobot total 14
 near(calculate(s).tcf,0.6+0.01*70);
 s.tf=s.tf.map(f=>({...f,rating:-999}));
 near(calculate(s).tf,-5*14);         // dijepit ke -5
});

test('biaya tambahan ikut terhitung pada total', () => {
 const s=newState();
 s.extras={infrastructure:5e6,license:2e6,training:1e6,migration:0};
 const c=calculate(s);
 near(c.extraCost,8e6);
 near(c.cost,c.resourceCost+8e6);
});

test('UUCW memakai bobot dari kompleksitas efektif', () => {
 const s=newState();
 s.useCases=[{id:'x',code:'UC-001',name:'a',actor:'',transactions:12,type:'Simple',override:false}];
 assert.equal(calculate(s).uucw,ucWeights.Complex);
 s.useCases[0].override=true;
 assert.equal(calculate(s).uucw,ucWeights.Simple);
});

test('validate menandai bobot fase yang tidak berjumlah 100%', () => {
 const s=newState();
 s.phases=[{name:'Planning',weight:50},{name:'Analysis',weight:20}];
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='error'&&/bobot fase/i.test(i.message)));
});

test('validate menandai kode use case duplikat', () => {
 const s=newState();
 s.useCases=[{id:'1',code:'UC-001',transactions:3,type:'Simple',override:false},{id:'2',code:'UC-001',transactions:3,type:'Simple',override:false}];
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='error'&&/duplikat/i.test(i.message)));
});

test('validate menandai kapasitas kerja nol', () => {
 const s={...newState(),params:{...seed.params,hours:0}};
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='error'&&/Kapasitas kerja/i.test(i.message)));
});

test('validate menandai override yang menyimpang dari klasifikasi transaksi', () => {
 const s=newState();
 s.useCases=[{id:'1',code:'UC-001',name:'a',transactions:12,type:'Simple',override:true}];
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='warn'&&/override manual/i.test(i.message)));
});

test('seed bawaan tidak menghasilkan satu pun error validasi', () => {
 const errors=validate(seed,calculate(seed)).filter(i=>i.level==='error');
 assert.deepEqual(errors,[]);
});

test('kalkulasi custom: Mandays = PM x durasi x working days', () => {
 const s=newState();
 s.custom={workingDays:22,projectDays:120};
 const c=calculate(s);
 near(c.mandays,c.pm*c.duration*22);
 near(c.man,c.mandays/120);
 // nilai konkret dari data contoh, sebagai pagar terhadap perubahan rumus
 near(c.mandays,199.7996,0.001);
 near(c.man,1.665,0.001);
});

test('kalkulasi custom memakai PM dan durasi dari perhitungan default', () => {
 const s=newState();
 s.custom={workingDays:20,projectDays:100};
 const c=calculate(s);
 // M adalah durasi terhitung 3 x PM^(1/3), bukan target bulan
 near(c.duration,3*Math.cbrt(c.pm));
 near(c.mandays,c.pm*(3*Math.cbrt(c.pm))*20);
 assert.notEqual(Math.round(c.mandays),Math.round(c.pm*s.params.targetMonths*20));
});

test('Hari Durasi Project nol menghasilkan 0, bukan Infinity', () => {
 const c=calculate({...newState(),custom:{workingDays:22,projectDays:0}});
 assert.ok(Number.isFinite(c.man));
 assert.equal(c.man,0);
 assert.ok(Number.isFinite(c.mandays));
});

test('custom yang hilang atau rusak tidak merusak perhitungan lain', () => {
 for(const custom of [undefined,null,'x',{},{workingDays:'a',projectDays:NaN}]){
  const c=calculate({...newState(),custom});
  for(const k of ['ucp','pm','duration','mandays','man','cost'])
   assert.ok(Number.isFinite(c[k]),`${k} tidak finite untuk custom=${JSON.stringify(custom)}`);
 }
});

test('validate memperingatkan Hari Durasi Project nol', () => {
 const s={...newState(),custom:{workingDays:22,projectDays:0}};
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='warn'&&/Hari Durasi Project/i.test(i.message)));
});

test('assigned value negatif membalik arah kontribusi faktor', () => {
 const s=newState();
 // E7 dan E8 berbobot -1, sehingga rating negatif menghasilkan hasil positif
 s.ef=s.ef.map(f=>f.id==='E7'||f.id==='E8'?{...f,rating:-1}:{...f,rating:0});
 const c=calculate(s);
 near(c.ef,2);                        // (-1 x -1) + (-1 x -1)
 near(c.ecf,1.4-0.03*2);
 // faktor berbobot positif bergerak ke arah sebaliknya
 const t=newState();
 t.tf=t.tf.map(f=>f.id==='T1'?{...f,rating:-3}:{...f,rating:0});
 near(calculate(t).tf,-6);            // -3 x bobot 2
 near(calculate(t).tcf,0.6+0.01*-6);
});

test('rating negatif tetap menghasilkan angka finite di seluruh rantai', () => {
 const s=newState();
 s.tf=s.tf.map(f=>({...f,rating:-5}));
 s.ef=s.ef.map(f=>({...f,rating:-5}));
 const c=calculate(s);
 for(const [k,v] of Object.entries(c))
  if(typeof v==='number')assert.ok(Number.isFinite(v),`${k} tidak finite: ${v}`);
});

const denganModul=()=>{
 const s=newState();
 s.modules=[{key:'m1',code:'M1',name:'Autentikasi'},{key:'m2',code:'M2',name:'Master Data'}];
 s.useCases=[
  {id:'1',code:'UC-001',name:'Login',actor:'',transactions:3,type:'Simple',override:false,module:'m1'},
  {id:'2',code:'UC-002',name:'Logout',actor:'',transactions:2,type:'Simple',override:false,module:'m1'},
  {id:'3',code:'UC-003',name:'Kelola',actor:'',transactions:9,type:'Complex',override:false,module:'m2'},
  {id:'4',code:'UC-004',name:'Lepas',actor:'',transactions:5,type:'Average',override:false,module:''}];
 return s;
};

test('rekap modul mengelompokkan use case beserta bobotnya', () => {
 const s=denganModul();
 const c=calculate(s);
 assert.equal(c.uucw,5+5+15+10);
 const [m1,m2,lepas]=c.moduleRows;
 assert.equal(m1.name,'Autentikasi');
 assert.deepEqual([m1.count,m1.Simple,m1.Average,m1.Complex,m1.uucw],[2,2,0,0,10]);
 assert.deepEqual([m2.count,m2.Simple,m2.Average,m2.Complex,m2.uucw],[1,0,0,1,15]);
 assert.equal(lepas.assigned,false,'use case tanpa modul masuk baris tersendiri');
 assert.equal(lepas.name,'Tanpa modul');
 assert.equal(lepas.uucw,10);
});

test('modul tanpa use case tetap muncul dengan nilai nol', () => {
 const s=denganModul();
 s.useCases=s.useCases.filter(u=>u.module!=='m2');
 const c=calculate(s);
 const m2=c.moduleRows.find(r=>r.key==='m2');
 assert.equal(m2.count,0);
 assert.equal(m2.uucw,0);
 assert.equal(m2.share,0);
 assert.ok(Number.isFinite(m2.pm));
});

test('rekap modul tetap aman tanpa modul dan tanpa use case', () => {
 const kosong=calculate({...newState(),modules:[],useCases:[]});
 assert.deepEqual(kosong.moduleRows,[]);
 const tanpaModul=calculate(newState());
 assert.equal(tanpaModul.moduleRows.length,1,'hanya baris tanpa modul');
 assert.equal(tanpaModul.moduleRows[0].assigned,false);
 assert.equal(tanpaModul.moduleRows[0].uucw,15);
});

test('kompleksitas efektif dipakai pada rekap, termasuk saat override', () => {
 const s=denganModul();
 s.useCases[0]={...s.useCases[0],type:'Complex',override:true};
 const c=calculate(s);
 const m1=c.moduleRows[0];
 assert.equal(m1.Complex,1);
 assert.equal(m1.Simple,1);
 assert.equal(m1.uucw,15+5);
});

test('validate memperingatkan use case yang belum masuk modul', () => {
 const s=denganModul();
 const issues=validate(s,calculate(s));
 assert.ok(issues.some(i=>i.level==='warn'&&/belum ditetapkan ke modul/i.test(i.message)));
 // tanpa modul sama sekali, peringatan itu tidak muncul
 const polos=newState();
 assert.ok(!validate(polos,calculate(polos)).some(i=>/belum ditetapkan ke modul/i.test(i.message)));
});

test('validate menandai nama modul yang kembar', () => {
 const s=denganModul();
 s.modules=[{key:'m1',code:'M1',name:'Sama'},{key:'m2',code:'M2',name:'sama'}];
 assert.ok(validate(s,calculate(s)).some(i=>i.level==='warn'&&/Nama modul duplikat/i.test(i.message)));
});

test('validate menandai actor yang tidak ada pada Actor Analysis', () => {
 const s=newState();
 s.actors=[{id:'a1',name:'Mahasiswa',type:'Simple',qty:1}];
 s.useCases=[{id:'1',code:'UC-001',name:'a',actor:'Mahasiswa',transactions:3,type:'Simple',override:false,module:''},
             {id:'2',code:'UC-002',name:'b',actor:'Dosen',transactions:3,type:'Simple',override:false,module:''}];
 const pesan=validate(s,calculate(s)).filter(i=>/tidak ada pada Actor Analysis/i.test(i.message));
 assert.equal(pesan.length,1);
 assert.ok(pesan[0].message.includes('Dosen'));
 assert.ok(!pesan[0].message.includes('Mahasiswa'));
 // actor kosong bukan pelanggaran
 s.useCases[1].actor='';
 assert.ok(!validate(s,calculate(s)).some(i=>/tidak ada pada Actor Analysis/i.test(i.message)));
});

test('UCP modul tetap 0 dan finite saat tidak ada use case sama sekali', () => {
 const s=denganModul();
 s.useCases=[];
 const c=calculate(s);
 for(const r of c.moduleRows){
  assert.ok(Number.isFinite(r.ucp),'ucp harus finite');
  assert.equal(r.ucp,0);
  assert.equal(r.share,0);
 }
});

test('Mandays per modul tetap finite saat pembagi custom nol', () => {
 const s=denganModul();
 s.custom={workingDays:22,projectDays:0};
 const c=calculate(s);
 for(const r of c.moduleRows){
  assert.ok(Number.isFinite(r.mandays));
  assert.ok(Number.isFinite(r.man));
  assert.equal(r.man,0);
 }
});

test('tiap modul dihitung berdiri sendiri, bukan sebagai potongan angka proyek', () => {
 const s=denganModul();
 const c=calculate(s);
 const [m1,m2]=c.moduleRows;
 // UCP modul = (UAW modul + UUCW modul) x TCF x ECF, memakai faktor proyek
 near(m1.ucp,(m1.uaw+m1.uucw)*c.tcf*c.ecf);
 near(m2.ucp,(m2.uaw+m2.uucw)*c.tcf*c.ecf);
 // dan bukan pembagian proporsional dari UCP proyek
 assert.notEqual(Math.round(m1.ucp*100),Math.round(c.ucp*m1.uucw/c.uucw*100));
});

test('tiap modul memperoleh durasi M sendiri dari PM-nya', () => {
 const s=denganModul();
 const c=calculate(s);
 for(const r of c.moduleRows){
  near(r.pm,r.ucp*c.phm/c.capacity);
  near(r.duration,3*Math.cbrt(r.pm));
  near(r.mandays,r.pm*r.duration*c.customWorkingDays);
  near(r.man,c.customProjectDays?r.mandays/c.customProjectDays:0);
 }
 // durasi modul lebih pendek dari durasi proyek karena effort-nya lebih kecil
 assert.ok(c.moduleRows.every(r=>r.duration<=c.duration+1e-9));
});

test('jumlah modul tidak dipaksa sama dengan angka proyek', () => {
 const s=denganModul();
 const c=calculate(s);
 const jml=c.moduleRows.reduce((a,r)=>a+r.mandays,0);
 assert.ok(jml<c.mandays,'memecah effort menurunkan durasi tiap bagian, jadi jumlahnya lebih kecil');
});

test('UAW modul berasal dari actor yang dirujuk use case di dalamnya', () => {
 const s=denganModul();
 s.actors=[{id:'a1',name:'Mahasiswa',type:'Simple',qty:2},{id:'a2',name:'Admin',type:'Complex',qty:1}];
 s.useCases=[
  {id:'1',code:'UC-1',name:'a',actor:'Mahasiswa',transactions:3,type:'Simple',override:false,module:'m1'},
  {id:'2',code:'UC-2',name:'b',actor:'Mahasiswa',transactions:3,type:'Simple',override:false,module:'m1'},
  {id:'3',code:'UC-3',name:'c',actor:'Admin',transactions:3,type:'Simple',override:false,module:'m2'},
  {id:'4',code:'UC-4',name:'d',actor:'Tidak Terdaftar',transactions:3,type:'Simple',override:false,module:'m2'},
 ];
 const c=calculate(s);
 const m1=c.moduleRows.find(r=>r.key==='m1'), m2=c.moduleRows.find(r=>r.key==='m2');
 assert.equal(m1.uaw,2,'actor yang sama dipakai dua use case hanya dihitung sekali: qty 2 x bobot Simple 1');
 assert.equal(m2.uaw,3,'Admin Complex qty 1; actor tak terdaftar tidak menyumbang');
 // seorang actor yang muncul di dua modul dihitung pada keduanya
 s.useCases[2].actor='Mahasiswa';
 const c2=calculate(s);
 assert.equal(c2.moduleRows.find(r=>r.key==='m2').uaw,2);
});

test('satu modul setara proyek hanya bila seluruh actor ikut dirujuk', () => {
 const s=denganModul();
 s.actors=[{id:'a1',name:'Mahasiswa',type:'Average',qty:2}];
 s.modules=[{key:'m1',code:'M1',name:'Tunggal'}];
 s.useCases=s.useCases.map(u=>({...u,module:'m1',actor:'Mahasiswa'}));
 const c=calculate(s);
 const r=c.moduleRows[0];
 assert.equal(r.uaw,c.uaw);
 assert.equal(r.uucw,c.uucw);
 near(r.ucp,c.ucp);
 near(r.mandays,c.mandays);
});

test('actor yang tidak dirujuk use case tidak masuk UAW modul', () => {
 const s=denganModul();
 s.modules=[{key:'m1',code:'M1',name:'Tunggal'}];
 s.useCases=s.useCases.map(u=>({...u,module:'m1',actor:''}));
 const c=calculate(s);
 assert.ok(c.uaw>0,'proyek tetap menghitung seluruh actor');
 assert.equal(c.moduleRows[0].uaw,0,'modul hanya menghitung actor yang benar-benar dirujuk');
 assert.ok(c.moduleRows[0].ucp<c.ucp);
});

test('modul kosong dan pembagi nol tetap menghasilkan angka finite', () => {
 const s=denganModul();
 s.useCases=[];
 s.custom={workingDays:22,projectDays:0};
 const c=calculate(s);
 for(const r of c.moduleRows){
  for(const k of ['uaw','uucw','ucp','pm','duration','mandays','man','cost'])
   assert.ok(Number.isFinite(r[k]),`${k} tidak finite`);
  assert.equal(r.man,0);
 }
});

test('biaya per modul tetap dibagi menurut porsi UUCW', () => {
 const s=denganModul();
 const c=calculate(s);
 near(c.moduleRows.reduce((a,r)=>a+r.cost,0),c.cost);
 near(c.moduleRows[0].cost,c.cost*c.moduleRows[0].uucw/c.uucw);
});
