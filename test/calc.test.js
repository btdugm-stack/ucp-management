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
 near(c.tf,42);                          // 13 faktor, rating 3, bobot total 14
 near(c.tcf,1.02);                       // 0.6 + 0.01 x 42
 near(c.ef,13.5);                        // 8 faktor, rating 3, bobot total 4.5
 near(c.ecf,0.995);                      // 1.4 - 0.03 x 13.5
 near(c.ucp,25.3725);
 near(c.ph,507.45);
 near(c.pm,507.45/176);
 near(c.duration,3*Math.cbrt(507.45/176));
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

test('rating di luar skala 0-5 tidak bisa menggelembungkan UCP', () => {
 const s=newState();
 s.tf=s.tf.map(f=>({...f,rating:999}));
 const c=calculate(s);
 near(c.tf,999>5?5*14:0);   // rating di-clamp ke 5
 near(c.tcf,0.6+0.01*70);
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
