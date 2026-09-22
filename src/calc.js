export const actorWeights={Simple:1,Average:2,Complex:3};
export const ucWeights={Simple:5,Average:10,Complex:15};
export const complexity=['Simple','Average','Complex'];
export const extraKeys=[['infrastructure','Infrastructure'],['license','License'],['training','Training'],['migration','Data Migration']];

// Setiap angka di aplikasi ini berasal dari field yang bisa dikosongkan user,
// jadi tidak ada nilai mentah yang boleh masuk ke rumus tanpa dikoersi dulu.
export const num=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback};
export const clamp=(v,min=-Infinity,max=Infinity)=>Math.min(max,Math.max(min,num(v,min===-Infinity?0:min)));
// Pembagian terjaga: pembagi 0 atau tidak valid menghasilkan 0, bukan Infinity/NaN.
export const div=(a,b)=>{const d=num(b,0);return d===0?0:num(a,0)/d};

// Standar UCP menurunkan kompleksitas dari jumlah transaksi.
// Analis tetap bisa mengunci nilainya lewat flag override.
export const deriveComplexity=t=>{const n=num(t,0);return n<=3?'Simple':n<=7?'Average':'Complex'};
export const effectiveType=uc=>uc.override&&complexity.includes(uc.type)?uc.type:deriveComplexity(uc.transactions);

export function calculate(s){
 const uaw=s.actors.reduce((a,x)=>a+clamp(x.qty,0)*(actorWeights[x.type]||0),0);
 const uucw=s.useCases.reduce((a,x)=>a+(ucWeights[effectiveType(x)]||0),0);
 const uu=uaw+uucw;
 const tf=s.tf.reduce((a,x)=>a+clamp(x.rating,0,5)*num(x.weight),0);
 const ef=s.ef.reduce((a,x)=>a+clamp(x.rating,0,5)*num(x.weight),0);
 const tcf=.6+.01*tf;
 const ecf=1.4-.03*ef;
 const ucp=uu*tcf*ecf;
 const phm=clamp(s.params.phm,0);
 const ph=ucp*phm;
 const capacity=clamp(s.params.hours,0)*clamp(s.params.days,0);
 const pm=div(ph,capacity);
 const duration=3*Math.cbrt(pm);
 const phaseWeight=s.phases.reduce((a,p)=>a+num(p.weight),0);
 const phase=s.phases.map(p=>({...p,duration:duration*num(p.weight)/100}));
 const targetMonths=clamp(s.params.targetMonths,0);
 const fte=div(pm,targetMonths);
 const resourceCost=s.roles.reduce((a,r)=>a+num(r.rate)*num(r.fte)*num(r.allocation)/100*duration,0);
 const extraCost=extraKeys.reduce((a,[k])=>a+num(s.extras?.[k]),0);
 const cost=resourceCost+extraCost;
 return {uaw,uucw,uu,tf,ef,tcf,ecf,ucp,phm,ph,capacity,pm,duration,phaseWeight,phase,targetMonths,fte,resourceCost,extraCost,cost};
}

// Aturan yang dulu hanya ditulis di teks hint sekarang ditegakkan di sini
// supaya angka yang tidak konsisten tidak lolos diam-diam ke laporan.
export function validate(s,c){
 const out=[];
 const add=(level,message)=>out.push({level,message});
 if(c.capacity<=0)add('error','Kapasitas kerja bernilai 0. Isi Working Hours/Day dan Working Days/Month agar effort dan biaya dapat dihitung.');
 if(c.phm<=0)add('error','Person Hour Multiplier bernilai 0, sehingga seluruh turunan effort menjadi 0.');
 if(Math.round(c.phaseWeight*100)/100!==100)add('error',`Total bobot fase ${c.phaseWeight}% — harus tepat 100% agar durasi fase menjumlah durasi proyek.`);
 if(c.targetMonths<=0)add('warn','Target Duration/Month bernilai 0, sehingga kebutuhan FTE tidak dapat dihitung.');
 const codes=s.useCases.map(u=>(u.code||'').trim()).filter(Boolean);
 const dup=[...new Set(codes.filter((x,i)=>codes.indexOf(x)!==i))];
 if(dup.length)add('error',`Kode use case duplikat: ${dup.join(', ')}.`);
 const forced=s.useCases.filter(u=>u.override&&u.type!==deriveComplexity(u.transactions));
 if(forced.length)add('warn',`${forced.length} use case memakai override manual yang berbeda dari klasifikasi transaksi: ${forced.map(u=>u.code||u.name).join(', ')}.`);
 if(!s.roles.length)add('warn','Belum ada peran pada staffing, sehingga biaya sumber daya bernilai 0.');
 if(c.targetMonths>0&&c.duration>0){
  const gap=Math.abs(c.duration-c.targetMonths);
  if(gap/c.targetMonths>.2)add('warn',`Durasi terhitung ${c.duration.toFixed(2)} bulan berbeda jauh dari target ${c.targetMonths} bulan. Rencana fase dan rencana staffing memakai dasar yang berbeda.`);
 }
 return out;
}
