import React,{useMemo,useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Boxes,Database,Copy,LayoutDashboard,FolderKanban,Users,Workflow,SlidersHorizontal,Calculator,CalendarDays,UsersRound,WalletCards,ShieldCheck,Save,RotateCcw,Plus,Trash2,Download,Upload,ChevronRight,TriangleAlert,CircleAlert,CircleCheck,FilePlus2,FolderOpen,Sparkles,ArrowRight,Clock,House} from 'lucide-react';
import {actorWeights,ucWeights,complexity,extraKeys,calculate,validate,clamp,num,deriveComplexity,effectiveType,RATING_MIN,RATING_MAX} from './calc.js';
import {newState,emptyProject,normalize,nextCode,nextModuleCode,newUseCase,newModule,resolveActiveModule,uid,statuses,levels,readStored,clearStored,clearAllLocal,legacyState,saveDraft,readDraft,clearDraft} from './state.js';
import {listProjects,getProject,createProject,saveProject,deleteProject,duplicateProject} from './api.js';
import './styles.css';

const AUTOSAVE_MS=1000;

// Input numerik yang menerima ketikan bebas tapi tidak pernah meneruskan nilai
// kosong atau di luar rentang ke state. Ini pertahanan lapis pertama terhadap
// pembagian nol dan rating di luar skala; calc.js menjaga lapis keduanya.
function NumInput({value,min,max,step,onCommit,...rest}){
 const [draft,setDraft]=useState(null);
 const commit=raw=>{if(raw==='')return;const n=Number(raw);if(Number.isFinite(n))onCommit(clamp(n,min,max))};
 return <input type="number" min={min} max={max} step={step} value={draft??String(value)}
  onChange={e=>{setDraft(e.target.value);commit(e.target.value)}}
  onBlur={()=>{if(draft!==null){const n=Number(draft);onCommit(draft===''||!Number.isFinite(n)?value:clamp(n,min,max))}setDraft(null)}} {...rest}/>;
}

// Tanpa boundary, satu error render membuat layar putih; dan karena state yang
// memicunya ikut tersimpan, aplikasi tidak bisa dibuka lagi. Layar ini selalu
// menyediakan jalan keluar: unduh cadangan mentah, atau bersihkan storage.
class Boundary extends React.Component{
 state={error:null};
 static getDerivedStateFromError(error){return {error}}
 render(){
  if(!this.state.error)return this.props.children;
  const backup=()=>{const raw=readStored();download(new Blob([raw??'{}'],{type:'application/json'}),'ucp-backup-rusak.json')};
  const recover=()=>{clearAllLocal();location.reload()};
  return <div className="crash"><div>
   <TriangleAlert size={34}/>
   <h1>Aplikasi gagal dimuat</h1>
   <p>Terjadi kesalahan saat merender data proyek. Proyek yang sudah tersimpan di database tidak terpengaruh — yang dibersihkan hanya data sementara di browser ini. Unduh cadangannya lebih dulu bila masih diperlukan.</p>
   <pre>{String(this.state.error?.message||this.state.error)}</pre>
   <div className="crash-actions">
    <button onClick={backup}><Download size={15}/>Unduh cadangan data</button>
    <button className="primary" onClick={recover}><RotateCcw size={15}/>Bersihkan & mulai ulang</button>
   </div>
  </div></div>;
 }
}

function Issues({items}){
 if(!items.length)return null;
 const errors=items.filter(i=>i.level==='error');
 return <section className={`issues ${errors.length?'has-error':''}`} role="status">
  <b>{errors.length?<CircleAlert size={15}/>:<TriangleAlert size={15}/>}{errors.length?`${errors.length} masalah menghalangi estimasi yang valid`:'Perlu diperiksa'}</b>
  <ul>{items.map((i,n)=><li key={n} className={i.level}>{i.message}</li>)}</ul>
 </section>;
}

const flow=[
 ['Project Setup','Catat identitas proyek: kode, nama, sponsor, business owner, jadwal, dan status.',FolderKanban],
 ['Actor Analysis','Daftarkan setiap actor dan klasifikasikan Simple, Average, atau Complex untuk memperoleh UAW.',Users],
 ['Use Case Analysis','Daftarkan use case beserta jumlah transaksinya. Kompleksitas diturunkan otomatis menjadi UUCW.',Workflow],
 ['Technical & Environmental Factors','Beri rating 0–5 pada 13 faktor teknis dan 8 faktor lingkungan untuk menghasilkan TCF dan ECF.',SlidersHorizontal],
 ['Calculation Engine','Rantai UCP terbentuk, lalu diterjemahkan menjadi person hour dan person-month lewat parameter effort.',Calculator],
 ['Phase & Schedule Planning','Bagi durasi ke fase SDLC. Total bobot fase harus tepat 100%.',CalendarDays],
 ['Staffing Plan','Hitung kebutuhan FTE terhadap target durasi, lalu susun alokasi peran.',UsersRound],
 ['Cost Estimation','Biaya sumber daya dari rate dan alokasi, ditambah biaya infrastruktur, lisensi, pelatihan, dan migrasi.',WalletCards],
 ['Feasibility Assessment','Simpulkan kelayakan teknis, ekonomi, dan organisasi beserta catatan asumsi serta risikonya.',ShieldCheck]
];
const chain=[['UAW','Bobot actor'],['UUCW','Bobot use case'],['TCF','0,6 + 0,01 × TF'],['ECF','1,4 − 0,03 × EF'],['UCP','(UAW + UUCW) × TCF × ECF'],['Effort','UCP × PHM'],['Duration','3 × PM^(1/3)']];

function StartScreen({onOpen,onCreate,onImportClick,legacy,onMigrate,onDismissLegacy}){
 const [rows,setRows]=useState(null);
 const [error,setError]=useState(null);
 const [busy,setBusy]=useState(false);

 const refresh=async()=>{
  setError(null);
  try{setRows(await listProjects())}
  catch(e){setError(e);setRows([])}
 };
 useEffect(()=>{refresh()},[]);

 const guard=fn=>async(...args)=>{
  if(busy)return;
  setBusy(true);
  try{await fn(...args)}
  catch(e){alert(e?.message||'Operasi gagal.')}
  finally{setBusy(false)}
 };
 const duplicate=guard(async id=>{await duplicateProject(id);await refresh()});
 const remove=guard(async row=>{
  if(!confirm(`Hapus proyek "${row.name||'Tanpa nama'}" beserta seluruh actor, use case, dan rencananya dari database?\n\nTindakan ini tidak dapat dibatalkan.`))return;
  await deleteProject(row.id);
  await refresh();
 });

 return <div className="start">
  <div className="start-inner">
   <header className="start-head">
    <div className="logo">U</div>
    <div><b>UCP Manager</b><small>Estimation Engine · MySQL</small></div>
   </header>
   <h1>Estimasi proyek berbasis Use Case Point</h1>
   <p className="lede">Susun estimasi effort, jadwal, kebutuhan tim, dan biaya proyek dari analisis actor dan use case. Setiap proyek tersimpan di database MySQL pada mesin ini.</p>

   {legacy&&<div className="legacy">
    <div>
     <b><Database size={15}/>Proyek dari versi sebelumnya ditemukan di browser ini</b>
     <small>{(legacy.name||'Tanpa nama')} · {legacy.code||'tanpa kode'} · {legacy.actors} actor · {legacy.useCases} use case. Versi lama menyimpan data di browser; pindahkan ke database agar ikut terdaftar di sini.</small>
    </div>
    <div className="legacy-actions">
     <button className="primary" onClick={()=>onMigrate(legacy.state)}>Pindahkan ke database</button>
     <button onClick={onDismissLegacy}>Abaikan</button>
    </div>
   </div>}

   <section className="projects">
    <div className="projects-head">
     <h2>Proyek</h2>
     <div>
      <button onClick={onImportClick}><Upload size={15}/>Import JSON</button>
      <button onClick={()=>onCreate(newState(),'dashboard')}><Sparkles size={15}/>Data contoh</button>
      <button className="primary" onClick={()=>onCreate(emptyProject(),'project')}><FilePlus2 size={15}/>Proyek Baru</button>
     </div>
    </div>

    {error&&<div className="db-down">
     <b><CircleAlert size={16}/>{error.kind==='database'?'Database tidak dapat dihubungi':'Server API tidak dapat dihubungi'}</b>
     <p>{error.message}</p>
     <small>{error.kind==='database'
      ?<>Nyalakan <b>MySQL</b> dari Laragon, lalu muat ulang daftar.</>
      :<>Backend PHP belum berjalan. Saat pengembangan, jalankan <code>npm run api</code> di terminal terpisah. Pada mode produksi, nyalakan <b>Apache</b> dari Laragon.</>}</small>
     <button onClick={refresh}><RotateCcw size={14}/>Coba lagi</button>
    </div>}

    {rows===null&&!error&&<p className="hint">Memuat daftar proyek…</p>}

    {rows!==null&&!error&&rows.length===0&&<div className="empty">
     <FolderOpen size={26}/>
     <b>Belum ada proyek</b>
     <small>Mulai dari kanvas kosong, atau muat data contoh untuk melihat rantai perhitungan yang sudah terisi.</small>
    </div>}

    {rows!==null&&rows.length>0&&<ul className="project-list">
     {rows.map(row=><li key={row.id}>
      <div className="project-main">
       <b>{row.name||'Tanpa nama'}</b>
       <ul className="start-meta">
        {row.code&&<li>{row.code}</li>}
        <li>{row.status}</li>
        <li>{row.actors} actor</li>
        <li>{row.useCases} use case</li>
        {row.savedAt&&<li><Clock size={12}/>{when(row.savedAt)}</li>}
       </ul>
      </div>
      <div className="project-actions">
       <button className="primary" onClick={()=>onOpen(row.id)}>Buka<ArrowRight size={14}/></button>
       <button onClick={()=>duplicate(row.id)} disabled={busy}><Copy size={14}/>Duplikat</button>
       <button className="danger" onClick={()=>remove(row)} disabled={busy} aria-label={`Hapus proyek ${row.name}`}><Trash2 size={14}/>Hapus</button>
      </div>
     </li>)}
    </ul>}
   </section>

   <section className="start-flow">
    <h2>Alur penggunaan</h2>
    <p className="lede">Sembilan modul dikerjakan berurutan. Setiap modul memberi masukan bagi modul berikutnya, dan seluruh angka dihitung ulang seketika saat ada perubahan.</p>
    <ol>{flow.map(([name,desc,Icon],i)=><li key={name}><span className="step">{i+1}</span><div><b><Icon size={15}/>{name}</b><small>{desc}</small></div></li>)}</ol>
   </section>

   <section className="start-chain">
    <h2>Rantai perhitungan</h2>
    <div className="chain">{chain.map(([k,v],i)=><div key={k}>{i>0&&<i aria-hidden="true">→</i>}<span><b>{k}</b><small>{v}</small></span></div>)}</div>
   </section>

   <p className="start-note">Perubahan tersimpan otomatis ke database MySQL. Bila database sempat tidak terjangkau, perubahan ditahan sementara di browser dan dikirim ulang begitu koneksi pulih. Gunakan <b>Export</b> untuk cadangan di luar database.</p>
  </div>
 </div>;
}

function App(){
 const [s,setS]=useState(emptyProject);
 const [projectId,setProjectId]=useState(null);
 const [view,setView]=useState('start');
 const [tab,setTab]=useState('dashboard');
 const [status,setStatus]=useState('saved');
 const [legacy,setLegacy]=useState(legacyState);
 const [activeModule,setActiveModule]=useState('');
 const fileRef=useRef(null);
 const importTarget=useRef('new');
 const skipSave=useRef(true);
 const calc=useMemo(()=>calculate(s),[s]);
 const issues=useMemo(()=>validate(s,calc),[s,calc]);

 // Autosave ke MySQL. Kegagalan tidak membuang pekerjaan: perubahan ditahan
 // sebagai draft di browser dan dikirim ulang pada penyimpanan berikutnya,
 // sehingga database yang mati tidak lagi berarti kehilangan data.
 useEffect(()=>{
  if(skipSave.current){skipSave.current=false;return}
  if(projectId===null)return;
  setStatus('dirty');
  const t=setTimeout(async()=>{
   setStatus('saving');
   try{await saveProject(projectId,s);clearDraft(projectId);setStatus('saved')}
   catch{saveDraft(projectId,s);setStatus('offline')}
  },AUTOSAVE_MS);
  return ()=>clearTimeout(t);
 },[s,projectId]);

 useEffect(()=>{
  if(status==='saved')return;
  const warn=e=>{e.preventDefault();e.returnValue=''};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[status]);

 // Pembaruan dengan structural sharing, bukan structuredClone penuh, supaya
 // biaya per ketukan tidak tumbuh mengikuti ukuran proyek.
 const update=(path,val)=>setS(prev=>{
  const next={...prev};let node=next;
  for(let i=0;i<path.length-1;i++){const k=path[i];node[k]=Array.isArray(node[k])?[...node[k]]:{...node[k]};node=node[k]}
  node[path[path.length-1]]=val;return next;
 });

 const land=(state,id,tabId,dirty=false)=>{
  skipSave.current=!dirty;
  setProjectId(id);
  setS(state);
  setActiveModule(resolveActiveModule(state.modules,''));
  setStatus(dirty?'dirty':'saved');
  setTab(tabId);
  setView('app');
 };

 const openProject=async id=>{
  try{
   const remote=normalize(await getProject(id));
   const draft=readDraft(id);
   // Draft hanya ada bila penyimpanan sebelumnya gagal. Keputusan memakainya
   // diserahkan ke pengguna karena hanya dia yang tahu mana yang lebih benar.
   if(draft&&confirm('Ada perubahan dari sesi sebelumnya yang belum sempat tersimpan ke database.\n\nOK untuk memulihkan perubahan itu, Batal untuk memakai versi yang ada di database.')){
    land(draft.state,id,'dashboard',true);
    return;
   }
   if(draft)clearDraft(id);
   land(remote,id,'dashboard');
  }catch(e){alert(e?.message||'Proyek gagal dibuka.')}
 };

 const createAndOpen=async(state,tabId)=>{
  try{
   const created=normalize(await createProject(state));
   land(created,created.id,tabId);
   return created;
  }catch(e){alert(e?.message||'Proyek gagal dibuat.');return null}
 };

 const migrateLegacy=async state=>{
  const created=await createAndOpen(state,'dashboard');
  if(created){clearStored();setLegacy(null)}
 };

 const saveNow=async()=>{
  if(projectId===null)return;
  setStatus('saving');
  try{await saveProject(projectId,s);clearDraft(projectId);setStatus('saved')}
  catch(e){saveDraft(projectId,s);setStatus('offline');alert(e?.message||'Penyimpanan ke database gagal. Perubahan ditahan di browser ini.')}
 };

 const deleteCurrent=async()=>{
  if(projectId===null)return;
  if(!confirm(`Hapus proyek "${s.project.name||'Tanpa nama'}" beserta seluruh isinya dari database?\n\nTindakan ini tidak dapat dibatalkan.`))return;
  try{
   await deleteProject(projectId);
   clearDraft(projectId);
   setProjectId(null);
   setStatus('saved');
   setView('start');
  }catch(e){alert(e?.message||'Penghapusan gagal.')}
 };

 const exportJson=()=>download(new Blob([JSON.stringify({...s,calculation:calc,issues},null,2)],{type:'application/json'}),`${s.project.code||'ucp'}-project.json`);
 const pickFile=target=>{importTarget.current=target;fileRef.current?.click()};
 const importJson=e=>{
  const file=e.target.files?.[0];e.target.value='';
  if(!file)return;
  const target=importTarget.current;
  const reader=new FileReader();
  reader.onload=async()=>{
   let data;
   try{data=normalize(JSON.parse(String(reader.result)))}
   catch{alert('File tidak dapat dibaca sebagai JSON proyek UCP yang valid.');return}
   delete data.id;
   if(target==='new'){await createAndOpen(data,'dashboard');return}
   if(confirm(`Ganti isi proyek ini dengan "${file.name}"? Isi lama akan ditimpa di database.`))setS({...data,id:projectId});
  };
  reader.onerror=()=>alert('Gagal membaca file.');
  reader.readAsText(file);
 };

 const goStart=async()=>{if(status==='dirty')await saveNow();setView('start')};

 const nav=[['dashboard','Dashboard',LayoutDashboard],['project','Project',FolderKanban],['actors','Actors',Users],['usecases','Use Cases',Workflow,[['usecases','Daftar Use Case'],['modulepreview','Use Case per Modul'],['modules','Rekap per Modul']]],['factors','Factors',SlidersHorizontal],['calculation','Calculation',Calculator],['planning','Planning',CalendarDays],['staffing','Staffing',UsersRound],['cost','Cost',WalletCards],['feasibility','Feasibility',ShieldCheck]];
 const badge={dirty:['dirty','Perubahan belum tersimpan'],saving:['dirty','Menyimpan…'],saved:['saved','Tersimpan di database'],offline:['error','Gagal tersimpan — ditahan di browser']}[status]??['saved','Tersimpan'];
 const picker=<input ref={fileRef} type="file" accept="application/json,.json" onChange={importJson} hidden aria-hidden="true" tabIndex={-1}/>;

 if(view==='start')return <>{picker}<StartScreen
  onOpen={openProject}
  onCreate={createAndOpen}
  onImportClick={()=>pickFile('new')}
  legacy={legacy}
  onMigrate={migrateLegacy}
  onDismissLegacy={()=>setLegacy(null)}/></>;

 return <div className="app">
  {picker}
  <aside>
   <div className="brand"><div className="logo">U</div><div><b>UCP Manager</b><small>Local Estimation Engine</small></div></div>
   <div className="project-mini"><span>PROJECT</span><strong>{s.project.name}</strong><small>{s.project.code}</small></div>
   <nav aria-label="Navigasi modul">{nav.map(([id,text,Icon,children])=>{
    const inGroup=children?children.some(([cid])=>cid===tab):tab===id;
    return <React.Fragment key={id}>
     <button className={inGroup?'active':''} onClick={()=>setTab(id)} aria-current={tab===id?'page':undefined} aria-expanded={children?inGroup:undefined}><Icon size={18}/>{text}</button>
     {children&&inGroup&&<div className="subnav">{children.map(([cid,ctext])=><button key={cid} className={tab===cid?'active':''} onClick={()=>setTab(cid)} aria-current={tab===cid?'page':undefined}>{ctext}</button>)}</div>}
    </React.Fragment>;
   })}</nav>
   <div className="side-actions four">
    <button onClick={goStart}><House size={16}/>Beranda</button>
    <button onClick={exportJson}><Download size={16}/>Export</button>
    <button onClick={()=>pickFile('current')}><Upload size={16}/>Import</button>
    <button className="danger" onClick={deleteCurrent}><Trash2 size={16}/>Hapus</button>
   </div>
  </aside>
  <main>
   <header>
    <div><div className="eyebrow">USE CASE POINT • PROJECT ESTIMATION</div><h1>{title(tab)}</h1></div>
    <div className="header-actions">
     <span className="status">{s.project.status}</span>
     <span className={`autosave ${badge[0]}`} role="status">{status==='saved'?<CircleCheck size={14}/>:<CircleAlert size={14}/>}{badge[1]}</span>
     <button className="primary" onClick={saveNow}><Save size={16}/>Simpan</button>
    </div>
   </header>
   <Issues items={issues}/>
   {tab==='dashboard'&&<Dashboard s={s} c={calc} go={setTab} update={update}/>}
   {tab==='project'&&<Project s={s} update={update}/>}
   {tab==='actors'&&<Actors s={s} setS={setS} c={calc}/>}
   {tab==='usecases'&&<UseCases s={s} setS={setS} c={calc} activeModule={activeModule} setActiveModule={setActiveModule}/>}
   {tab==='modulepreview'&&<ModulePreview s={s} c={calc} go={setTab}/>}
   {tab==='modules'&&<ModuleRecap s={s} c={calc} go={setTab}/>}
   {tab==='factors'&&<Factors s={s} update={update} c={calc}/>}
   {tab==='calculation'&&<Calculation s={s} c={calc} update={update}/>}
   {tab==='planning'&&<Planning s={s} c={calc} update={update}/>}
   {tab==='staffing'&&<Staffing s={s} c={calc} setS={setS}/>}
   {tab==='cost'&&<Cost s={s} c={calc} update={update}/>}
   {tab==='feasibility'&&<Feasibility s={s} update={update} c={calc}/>}
  </main>
 </div>;
}

function title(t){return {dashboard:'Executive Dashboard',project:'Project Setup',actors:'Actor Analysis',usecases:'Use Case Analysis',modulepreview:'Use Case per Modul',modules:'Rekap Use Case per Modul',factors:'Technical & Environmental Factors',calculation:'UCP Calculation Engine',planning:'Phase & Schedule Planning',staffing:'Staffing Plan',cost:'Cost Estimation',feasibility:'Feasibility Assessment'}[t]}
function Card({label,value,sub}){return <div className="card"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}

function Dashboard({s,c,go,update}){return <><section className="hero"><div><span className="pill">BASELINE ESTIMATE</span><h2>{s.project.name}</h2><p>{s.project.description}</p></div><div className="hero-number"><small>USE CASE POINT</small><b>{c.ucp.toFixed(2)}</b><span>{c.pm.toFixed(2)} person-month</span></div></section><div className="cards"><Card label="UCP" value={c.ucp.toFixed(2)} sub="Use Case Point"/><Card label="Person Hours" value={fmt(c.ph)} sub={`PHM ${s.params.phm}`}/><Card label="Person-Month" value={c.pm.toFixed(2)} sub="Effort"/><Card label="Duration" value={`${c.duration.toFixed(2)} mo`} sub="3 × PM^(1/3)"/></div><div className="grid2"><section className="panel"><div className="panel-head"><h3>Calculation Flow</h3><button onClick={()=>go('calculation')}>Open Engine <ChevronRight size={15}/></button></div><div className="flow"><div><b>{c.uaw.toFixed(0)}</b><small>UAW</small></div><i>+</i><div><b>{c.uucw.toFixed(0)}</b><small>UUCW</small></div><i>×</i><div><b>{c.tcf.toFixed(2)}</b><small>TCF</small></div><i>×</i><div><b>{c.ecf.toFixed(2)}</b><small>ECF</small></div><i>=</i><div className="accent"><b>{c.ucp.toFixed(2)}</b><small>UCP</small></div></div></section><section className="panel"><div className="panel-head"><h3>SDLC Distribution</h3><button onClick={()=>go('planning')}>Edit <ChevronRight size={15}/></button></div>{c.phase.map(p=><div className="barrow" key={p.name}><div><span>{p.name}</span><b>{p.duration.toFixed(2)} mo</b></div><div className="bar"><i style={{width:`${Math.min(100,num(p.weight))}%`}}/></div></div>)}</section></div><div className="grid2"><section className="panel"><div className="panel-head"><h3>Scenario Sensitivity</h3><button onClick={()=>go('calculation')}>Configure</button></div><table><caption className="sr-only">Sensitivitas estimasi terhadap PHM dan kapasitas kerja</caption><thead><tr><th scope="col">PHM</th><th scope="col">Capacity</th><th scope="col">Person-Month</th><th scope="col">Duration</th></tr></thead><tbody>{[[20,8,22],[20,10,26],[28,8,22],[28,10,26]].map(x=>{const pm=(c.ucp*x[0])/(x[1]*x[2]);return <tr key={x.join()}><td>{x[0]}</td><td>{x[1]}h × {x[2]}d</td><td>{pm.toFixed(2)}</td><td>{(3*Math.cbrt(pm)).toFixed(2)} mo</td></tr>})}</tbody></table></section><CustomScenario s={s} c={c} update={update}/></div></>}

// Skenario alternatif yang memakai PM dan durasi dari perhitungan default,
// lalu menerjemahkannya menjadi mandays dan jumlah orang lewat dua angka yang
// ditentukan sendiri. Berdampingan dengan tabel sensitivity agar pembacaan
// versi baku dan versi custom terjadi bersamaan.
function CustomScenario({s,c,update}){
 return <section className="panel">
  <div className="panel-head"><h3>Kalkulasi Custom</h3><span className="pill">MANDAYS &amp; MAN</span></div>
  <div className="formgrid tight">
   <label>Working Days<NumInput value={s.custom.workingDays} min={1} max={31} onCommit={v=>update(['custom','workingDays'],v)}/></label>
   <label>Hari Durasi Project<NumInput value={s.custom.projectDays} min={1} max={100000} onCommit={v=>update(['custom','projectDays'],v)}/></label>
  </div>
  <div className="mini-results">
   <Card label="Mandays" value={fmt(c.mandays)} sub="person-day"/>
   <Card label="Man" value={fmt(c.man)} sub="orang"/>
  </div>
  <div className="formula"><b>Mandays</b><code>PM × M × Working Days = {fmt(c.pm)} × {fmt(c.duration)} × {fmt(c.customWorkingDays)} = {fmt(c.mandays)}</code></div>
  <div className="formula"><b>Man</b><code>Mandays ÷ Hari Durasi Project = {fmt(c.mandays)} ÷ {fmt(c.customProjectDays)} = {fmt(c.man)}</code></div>
  <p className="hint">PM dan M diambil dari perhitungan default: effort {fmt(c.pm)} person-month dan durasi {fmt(c.duration)} bulan. Dengan {fmt(c.customWorkingDays)} hari kerja per bulan, durasi itu setara {fmt(c.durationDays)} hari kerja.</p>
 </section>;
}

function Project({s,update}){return <section className="panel form"><div className="formgrid">{[['code','Project Code'],['name','Project Name'],['sponsor','Project Sponsor'],['owner','Business Owner'],['manager','Project Manager'],['start','Start Date'],['target','Target Completion']].map(([k,l])=><label key={k}>{l}<input value={s.project[k]} type={k==='start'||k==='target'?'date':'text'} onChange={e=>update(['project',k],e.target.value)}/></label>)}<label>Project Status<select value={s.project.status} onChange={e=>update(['project','status'],e.target.value)}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label><label className="wide">Description<textarea value={s.project.description} onChange={e=>update(['project','description'],e.target.value)}/></label></div></section>}

function Actors({s,setS,c}){
 const add=()=>setS(p=>({...p,actors:[...p.actors,{id:uid(),name:'New Actor',type:'Simple',qty:1}]}));
 const patch=(id,k,v)=>setS(p=>({...p,actors:p.actors.map(x=>x.id===id?{...x,[k]:v}:x)}));
 const del=(id,name)=>{if(confirm(`Hapus actor "${name}"?`))setS(p=>({...p,actors:p.actors.filter(x=>x.id!==id)}))};
 return <section className="panel"><div className="panel-head"><h3>Actors</h3><button className="primary" onClick={add}><Plus size={15}/>Add Actor</button></div><table><caption className="sr-only">Daftar actor dan bobotnya</caption><thead><tr><th scope="col">Actor</th><th scope="col">Classification</th><th scope="col">Qty</th><th scope="col">Weight</th><th scope="col">Subtotal</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead><tbody>{s.actors.map(a=><tr key={a.id}><td><input value={a.name} aria-label="Nama actor" onChange={e=>patch(a.id,'name',e.target.value)}/></td><td><select value={a.type} aria-label="Klasifikasi actor" onChange={e=>patch(a.id,'type',e.target.value)}>{Object.keys(actorWeights).map(x=><option key={x}>{x}</option>)}</select></td><td><NumInput value={a.qty} min={0} max={9999} aria-label="Jumlah actor" onCommit={v=>patch(a.id,'qty',v)}/></td><td>{actorWeights[a.type]}</td><td><b>{num(a.qty)*actorWeights[a.type]}</b></td><td><button className="icon" aria-label={`Hapus actor ${a.name}`} onClick={()=>del(a.id,a.name)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{!s.actors.length&&<p className="hint">Belum ada actor. UAW akan bernilai 0.</p>}<div className="total">UAW <b>{c.uaw}</b></div></section>;
}

function UseCases({s,setS,c,activeModule,setActiveModule}){
 const active=resolveActiveModule(s.modules,activeModule);
 const aktif=s.modules.find(m=>m.key===active);
 const add=()=>setS(p=>({...p,useCases:[...p.useCases,newUseCase(p.useCases,resolveActiveModule(p.modules,active))]}));
 const patch=(id,k,v)=>setS(p=>({...p,useCases:p.useCases.map(x=>x.id===id?{...x,[k]:v}:x)}));
 const del=(id,name)=>{if(confirm(`Hapus use case "${name}"?`))setS(p=>({...p,useCases:p.useCases.filter(x=>x.id!==id)}))};
 // Modul yang baru dibuat langsung menjadi tujuan penempatan, sehingga
 // menambahkan modul lalu menambahkan use case sudah cukup tanpa langkah
 // penetapan terpisah.
 const addModule=()=>setS(p=>{const m=newModule(p.modules);setActiveModule(m.key);return {...p,modules:[...p.modules,m]}});
 const patchModule=(key,k,v)=>setS(p=>({...p,modules:p.modules.map(m=>m.key===key?{...m,[k]:v}:m)}));
 const delModule=(key,name)=>{
  const dipakai=s.useCases.filter(u=>u.module===key).length;
  const pesan=dipakai?`Hapus modul "${name}"? ${dipakai} use case di dalamnya tidak ikut terhapus, hanya dilepas dari modul.`:`Hapus modul "${name}"?`;
  if(confirm(pesan))setS(p=>({...p,modules:p.modules.filter(m=>m.key!==key),useCases:p.useCases.map(u=>u.module===key?{...u,module:''}:u)}));
 };
 return <>
  {!!s.modules.length&&<section className="panel">
   <div className="panel-head"><h3>Modul Aplikasi</h3><span className="total">{s.modules.length} modul</span></div>
   <table><caption className="sr-only">Daftar modul aplikasi dan modul yang sedang aktif</caption>
    <thead><tr><th scope="col">Aktif</th><th scope="col">Kode</th><th scope="col">Nama Modul</th><th scope="col">Use Case</th><th scope="col">UUCW</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
    <tbody>{s.modules.map(m=>{const row=c.moduleRows.find(r=>r.key===m.key);return <tr key={m.key} className={m.key===active?'aktif':''}>
     <td><label className="check"><input type="radio" name="modul-aktif" checked={m.key===active} aria-label={`Jadikan ${m.name} modul aktif`} onChange={()=>setActiveModule(m.key)}/><span>{m.key===active?'aktif':''}</span></label></td>
     <td><input className="code" value={m.code} aria-label="Kode modul" onChange={e=>patchModule(m.key,'code',e.target.value)}/></td>
     <td><input value={m.name} aria-label="Nama modul" onChange={e=>patchModule(m.key,'name',e.target.value)}/></td>
     <td>{row?.count??0}</td>
     <td><b>{row?.uucw??0}</b></td>
     <td><button className="icon" aria-label={`Hapus modul ${m.name}`} onClick={()=>delModule(m.key,m.name)}><Trash2 size={15}/></button></td>
    </tr>})}</tbody></table>
   <p className="hint">Use case yang ditambahkan akan masuk ke modul yang bertanda <b>aktif</b>. Pilih baris lain untuk memindahkan tujuan penempatan sebelum menambah use case berikutnya.</p>
  </section>}

  <section className="panel">
   <div className="panel-head"><h3>Use Cases</h3><div className="head-buttons">
    <button onClick={addModule}><Boxes size={15}/>Add Modul</button>
    <button className="primary" onClick={add}><Plus size={15}/>Add Use Case{aktif&&<span className="target">→ {aktif.code||aktif.name}</span>}</button>
   </div></div>
   <table><caption className="sr-only">Daftar use case, jumlah transaksi, dan kompleksitasnya</caption>
   <thead><tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Actor</th><th scope="col">Transactions</th><th scope="col">Complexity</th><th scope="col">Override</th><th scope="col">Weight</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
   <tbody>{s.useCases.map(u=>{const derived=deriveComplexity(u.transactions);const eff=effectiveType(u);return <tr key={u.id}>
    <td><input className="code" value={u.code} aria-label="Kode use case" onChange={e=>patch(u.id,'code',e.target.value)}/></td>
    <td><input value={u.name} aria-label="Nama use case" onChange={e=>patch(u.id,'name',e.target.value)}/></td>
    <td><input value={u.actor} aria-label="Actor terkait" onChange={e=>patch(u.id,'actor',e.target.value)}/></td>
    <td><NumInput value={u.transactions} min={0} max={999} aria-label="Jumlah transaksi" onCommit={v=>patch(u.id,'transactions',v)}/></td>
    <td>{u.override?<select value={u.type} aria-label="Kompleksitas manual" onChange={e=>patch(u.id,'type',e.target.value)}>{complexity.map(x=><option key={x}>{x}</option>)}</select>:<span className="derived">{derived}<small>dari {num(u.transactions)} transaksi</small></span>}</td>
    <td><label className="check"><input type="checkbox" checked={u.override} aria-label={`Override kompleksitas ${u.code}`} onChange={e=>patch(u.id,'override',e.target.checked)}/><span>manual</span></label></td>
    <td><b>{ucWeights[eff]}</b>{u.override&&u.type!==derived&&<small className="flag">≠ {derived}</small>}</td>
    <td><button className="icon" aria-label={`Hapus use case ${u.name}`} onClick={()=>del(u.id,u.name)}><Trash2 size={15}/></button></td>
   </tr>})}</tbody></table>
   {!s.useCases.length&&<p className="hint">Belum ada use case. UUCW akan bernilai 0.</p>}
   <div className="total">UUCW <b>{c.uucw}</b></div>
   <p className="hint">Kompleksitas diturunkan dari jumlah transaksi sesuai model UCP: ≤3 Simple, 4–7 Average, &gt;7 Complex. Centang <b>manual</b> hanya bila analis sengaja menetapkan bobot yang berbeda; selisihnya akan ditandai pada panel peringatan. Modul bersifat opsional — penempatan use case ke modul dapat ditinjau pada submenu <b>Use Case per Modul</b>.</p>
  </section>
 </>;
}

// Pratinjau penempatan use case per modul. Halaman ini hanya untuk ditinjau,
// sehingga seluruh nilainya ditampilkan apa adanya tanpa kolom isian.
function ModulePreview({s,c,go}){
 const milik=key=>s.useCases.filter(u=>(s.modules.some(m=>m.key===u.module)?u.module:'')===key);
 const lepas=c.moduleRows.find(r=>!r.assigned);
 if(!s.useCases.length)return <section className="panel"><div className="empty"><Boxes size={26}/><b>Belum ada use case</b><small>Tambahkan use case lebih dulu pada Daftar Use Case; penempatannya ke modul akan tampil di sini.</small><div className="crash-actions"><button className="primary" onClick={()=>go('usecases')}>Buka Daftar Use Case<ChevronRight size={15}/></button></div></div></section>;
 return <>
  <div className="cards">
   <Card label="Modul" value={s.modules.length} sub="kelompok aplikasi"/>
   <Card label="Use Case" value={s.useCases.length}/>
   <Card label="Sudah Bermodul" value={s.useCases.length-(lepas?.count??0)}/>
   <Card label="Tanpa Modul" value={lepas?.count??0}/>
  </div>
  {c.moduleRows.map(r=><section className="panel" key={r.key||'__lepas'}>
   <div className="panel-head">
    <h3>{r.name}{r.code&&<span className="tag">{r.code}</span>}</h3>
    <span className="total">{r.count} use case · UUCW <b>{r.uucw}</b></span>
   </div>
   {r.count
    ?<table><caption className="sr-only">Use case pada {r.name}</caption>
      <thead><tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Actor</th><th scope="col">Transactions</th><th scope="col">Complexity</th><th scope="col">Weight</th></tr></thead>
      <tbody>{milik(r.key).map(u=>{const eff=effectiveType(u);return <tr key={u.id}>
       <td>{u.code}</td><td>{u.name}</td><td>{u.actor||<span className="muted">—</span>}</td>
       <td>{num(u.transactions)}</td>
       <td>{eff}{u.override&&<small className="flag">manual</small>}</td>
       <td><b>{ucWeights[eff]}</b></td>
      </tr>})}</tbody></table>
    :<p className="hint">Belum ada use case pada modul ini. Jadikan modul ini <b>aktif</b> pada Daftar Use Case, lalu tambahkan use case.</p>}
  </section>)}
  <section className="panel"><div className="panel-head"><h3>Tinjauan</h3><button onClick={()=>go('modules')}>Lihat Rekap Angka <ChevronRight size={15}/></button></div>
   <p className="hint">Halaman ini hanya untuk ditinjau. Penempatan use case mengikuti modul yang <b>aktif</b> saat use case dibuat, diatur pada Daftar Use Case.</p>
  </section>
 </>;
}

// Rekap per modul. Porsi effort, durasi, dan biaya dihitung proporsional
// terhadap UUCW karena hanya UUCW yang melekat pada masing-masing use case.
function ModuleRecap({s,c,go}){
 const rows=c.moduleRows;
 const total=rows.reduce((a,r)=>({count:a.count+r.count,Simple:a.Simple+r.Simple,Average:a.Average+r.Average,Complex:a.Complex+r.Complex,uucw:a.uucw+r.uucw,pm:a.pm+r.pm,cost:a.cost+r.cost}),{count:0,Simple:0,Average:0,Complex:0,uucw:0,pm:0,cost:0});
 if(!s.modules.length&&!s.useCases.length)return <section className="panel"><div className="empty"><Boxes size={26}/><b>Belum ada use case</b><small>Tambahkan use case lebih dulu, lalu kelompokkan ke modul lewat tombol Add Modul.</small><div className="crash-actions"><button className="primary" onClick={()=>go('usecases')}>Buka Daftar Use Case<ChevronRight size={15}/></button></div></div></section>;
 return <>
  <div className="cards">
   <Card label="Modul" value={s.modules.length} sub="kelompok aplikasi"/>
   <Card label="Use Case" value={total.count}/>
   <Card label="UUCW" value={total.uucw} sub="bobot use case"/>
   <Card label="Effort" value={`${c.pm.toFixed(2)} PM`} sub="seluruh proyek"/>
  </div>
  <section className="panel">
   <div className="panel-head"><h3>Rekap per Modul</h3><button onClick={()=>go('usecases')}>Kelola Modul <ChevronRight size={15}/></button></div>
   {!s.modules.length
    ?<p className="hint">Belum ada modul. Seluruh {total.count} use case dihitung sebagai satu kesatuan. Tambahkan modul lewat tombol <b>Add Modul</b> pada Daftar Use Case bila estimasi perlu dipecah.</p>
    :null}
   <table><caption className="sr-only">Rekap use case, UUCW, effort, dan biaya per modul</caption>
    <thead><tr><th scope="col">Modul</th><th scope="col">UC</th><th scope="col">Simple</th><th scope="col">Average</th><th scope="col">Complex</th><th scope="col">UUCW</th><th scope="col">Porsi</th><th scope="col">Effort</th><th scope="col">Biaya</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.key||'__lepas'} className={r.assigned?'':'loose'}>
     <td><b>{r.name}</b>{r.code&&<small className="flag">{r.code}</small>}</td>
     <td>{r.count}</td><td>{r.Simple}</td><td>{r.Average}</td><td>{r.Complex}</td>
     <td><b>{r.uucw}</b></td>
     <td><div className="share"><i style={{width:`${Math.min(100,r.share*100)}%`}}/></div><small>{(r.share*100).toFixed(1)}%</small></td>
     <td>{r.pm.toFixed(2)} PM</td>
     <td>{money(r.cost)}</td>
    </tr>)}</tbody>
    <tfoot><tr><td>Total</td><td>{total.count}</td><td>{total.Simple}</td><td>{total.Average}</td><td>{total.Complex}</td><td><b>{total.uucw}</b></td><td>100%</td><td>{total.pm.toFixed(2)} PM</td><td><b>{money(total.cost)}</b></td></tr></tfoot>
   </table>
   <p className="hint">Porsi dihitung dari UUCW, satu-satunya besaran UCP yang melekat pada masing-masing use case. UAW, TCF, dan ECF berlaku untuk proyek secara keseluruhan sehingga effort dan biaya per modul bersifat proporsional, bukan hasil perhitungan UCP yang berdiri sendiri per modul.</p>
  </section>
 </>;
}

function Factors({s,update,c}){
 const list=(key,heading)=><div className="factorbox"><h3>{heading}</h3><div className="factor head" aria-hidden="true"><span>Faktor</span><span>Assigned Value</span><span>Bobot</span><span>Hasil</span></div>{s[key].map((x,i)=>{const product=num(x.rating)*num(x.weight);return <div className="factor" key={x.id}><div><b>{x.id} · {x.name}</b><small>{x.desc}</small></div><NumInput value={x.rating} min={RATING_MIN} max={RATING_MAX} aria-label={`Assigned value ${x.id} ${x.name}`} onCommit={v=>{const a=[...s[key]];a[i]={...a[i],rating:v};update([key],a)}}/><span>× {x.weight}</span><strong className={product<0?'neg':''}>{product.toFixed(2)}</strong></div>})}</div>;
 return <div className="grid2">{list('tf','Technical Factors')}{list('ef','Environmental Factors')}<section className="panel"><div className="mini-results"><Card label="TF" value={c.tf.toFixed(2)}/><Card label="TCF" value={c.tcf.toFixed(3)}/></div></section><section className="panel"><div className="mini-results"><Card label="EF" value={c.ef.toFixed(2)}/><Card label="ECF" value={c.ecf.toFixed(3)}/></div></section><p className="hint wide">Kolom yang dapat diisi adalah <b>assigned value</b>, sedangkan <b>× bobot</b> di sebelahnya ditetapkan oleh model UCP dan tidak dapat diubah. Rentang yang diterima −5 sampai 5; UCP standar memakai 0–5, jadi nilai negatif akan membalik arah kontribusi faktor terhadap TF maupun EF.</p></div>;
}

function Calculation({s,c,update}){
 const fields=[['phm','Person Hour Multiplier (PHM)',1,1000],['hours','Working Hours / Day',1,24],['days','Working Days / Month',1,31],['targetMonths','Target Duration / Month',0,600]];
 return <><div className="cards"><Card label="UUCP" value={c.uu.toFixed(2)} sub={`${c.uaw} UAW + ${c.uucw} UUCW`}/><Card label="TCF" value={c.tcf.toFixed(3)} sub={`TF ${c.tf.toFixed(2)}`}/><Card label="ECF" value={c.ecf.toFixed(3)} sub={`EF ${c.ef.toFixed(2)}`}/><Card label="UCP" value={c.ucp.toFixed(2)} sub="UUCP × TCF × ECF"/></div>
  <section className="panel form"><h3>Effort Parameters</h3><div className="formgrid">{fields.map(([k,l,min,max])=><label key={k}>{l}<NumInput value={s.params[k]} min={min} max={max} onCommit={v=>update(['params',k],v)}/></label>)}</div></section>
  <section className="panel"><h3>Calculation Chain</h3><div className="formula"><b>Person Hours</b><code>UCP × PHM = {c.ucp.toFixed(2)} × {s.params.phm} = {fmt(c.ph)} hours</code></div><div className="formula"><b>Person-Month</b><code>PH ÷ (hours/day × days/month) = {fmt(c.ph)} ÷ ({s.params.hours} × {s.params.days}) = {c.pm.toFixed(2)} PM</code></div><div className="formula"><b>Duration</b><code>3 × PM^(1/3) = {c.duration.toFixed(2)} months</code></div></section></>;
}

function Planning({s,c,update}){
 const off=Math.round(c.phaseWeight*100)/100!==100;
 return <section className="panel"><div className="panel-head"><h3>Phase Distribution</h3><span className={`total ${off?'bad':''}`}>Total <b>{c.phaseWeight}%</b></span></div>
  {s.phases.map((p,i)=><div className="phase-edit" key={p.name}><label>{p.name}<NumInput value={p.weight} min={0} max={100} onCommit={v=>{const a=[...s.phases];a[i]={...a[i],weight:v};update(['phases'],a)}}/></label><div className="phase-track"><i style={{width:`${Math.min(100,num(p.weight))}%`}}/></div><strong>{(c.duration*num(p.weight)/100).toFixed(2)} mo</strong></div>)}
  {off&&<p className="hint bad">Total bobot {c.phaseWeight}% — jumlah durasi fase tidak akan sama dengan durasi proyek ({c.duration.toFixed(2)} bulan) sampai totalnya tepat 100%.</p>}
  <p className="hint">Baseline mengikuti workbook: Planning 15%, Analysis 20%, Design 35%, Implementation 30%.</p></section>;
}

function Staffing({s,c,setS}){
 const required=Number.isFinite(c.fte)?Math.ceil(c.fte):0;
 const total=s.roles.reduce((a,r)=>a+num(r.fte)*num(r.allocation)/100,0);
 const add=()=>setS(p=>({...p,roles:[...p.roles,{id:uid(),name:'New Role',rate:10000000,fte:1,allocation:100}]}));
 const patch=(id,k,v)=>setS(p=>({...p,roles:p.roles.map(r=>r.id===id?{...r,[k]:v}:r)}));
 const del=(id,name)=>{if(confirm(`Hapus peran "${name}"?`))setS(p=>({...p,roles:p.roles.filter(r=>r.id!==id)}))};
 return <><div className="cards"><Card label="Target Duration" value={`${s.params.targetMonths} mo`}/><Card label="Effort" value={`${c.pm.toFixed(2)} PM`}/><Card label="Calculated FTE" value={c.fte.toFixed(2)}/><Card label="Suggested Team" value={`${required} FTE`}/></div>
  <section className="panel"><div className="panel-head"><h3>Role Allocation</h3><button className="primary" onClick={add}><Plus size={15}/>Add Role</button></div>
  <table><caption className="sr-only">Alokasi peran dan FTE efektif</caption><thead><tr><th scope="col">Role</th><th scope="col">Monthly Rate</th><th scope="col">FTE</th><th scope="col">Allocation %</th><th scope="col">Effective FTE</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
  <tbody>{s.roles.map(r=><tr key={r.id}><td><input value={r.name} aria-label="Nama peran" onChange={e=>patch(r.id,'name',e.target.value)}/></td><td><NumInput value={r.rate} min={0} max={1e12} step={100000} aria-label="Rate bulanan" onCommit={v=>patch(r.id,'rate',v)}/></td><td><NumInput value={r.fte} min={0} max={999} step={.5} aria-label="FTE" onCommit={v=>patch(r.id,'fte',v)}/></td><td><NumInput value={r.allocation} min={0} max={100} aria-label="Alokasi persen" onCommit={v=>patch(r.id,'allocation',v)}/></td><td>{(num(r.fte)*num(r.allocation)/100).toFixed(2)}</td><td><button className="icon" aria-label={`Hapus peran ${r.name}`} onClick={()=>del(r.id,r.name)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>
  {!s.roles.length&&<p className="hint">Belum ada peran. Biaya sumber daya akan bernilai 0.</p>}
  <div className="total">Effective FTE <b>{total.toFixed(2)}</b></div>
  <p className="hint">Kebutuhan FTE dihitung dari target {s.params.targetMonths} bulan, sedangkan Planning memakai durasi terhitung {c.duration.toFixed(2)} bulan. Samakan keduanya bila rencana staffing dan rencana jadwal harus konsisten.</p></section></>;
}

function Cost({s,c,update}){return <><div className="cards"><Card label="Total Cost" value={money(c.cost)} sub="Sumber daya + biaya lain"/><Card label="Resource Cost" value={money(c.resourceCost)}/><Card label="Additional Cost" value={money(c.extraCost)}/><Card label="Cost / PM" value={money(c.pm?c.cost/c.pm:0)}/></div>
 <section className="panel"><h3>Resource Cost</h3><table><caption className="sr-only">Biaya per peran sepanjang durasi proyek</caption><thead><tr><th scope="col">Role</th><th scope="col">Rate / Month</th><th scope="col">FTE</th><th scope="col">Allocation</th><th scope="col">Cost</th></tr></thead><tbody>{s.roles.map(r=><tr key={r.id}><td>{r.name}</td><td>{money(r.rate)}</td><td>{r.fte}</td><td>{r.allocation}%</td><td>{money(num(r.rate)*num(r.fte)*num(r.allocation)/100*c.duration)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Subtotal sumber daya</td><td><b>{money(c.resourceCost)}</b></td></tr></tfoot></table></section>
 <section className="panel form"><h3>Additional Costs</h3><div className="formgrid">{extraKeys.map(([k,l])=><label key={k}>{l}<NumInput value={s.extras[k]} min={0} max={1e12} step={100000} onCommit={v=>update(['extras',k],v)}/></label>)}</div><div className="total">Subtotal biaya lain <b>{money(c.extraCost)}</b></div></section>
 <section className="panel"><div className="total big">Total biaya proyek <b>{money(c.cost)}</b></div></section></>}

function Feasibility({s,update,c}){return <><div className="cards"><Card label="Technical" value={s.feas.technical}/><Card label="Economic" value={s.feas.economic}/><Card label="Organizational" value={s.feas.organizational}/><Card label="Project Effort" value={`${c.pm.toFixed(2)} PM`}/></div><section className="panel form"><div className="formgrid">{[['technical','Technical Feasibility'],['economic','Economic Feasibility'],['organizational','Organizational Feasibility']].map(([k,l])=><label key={k}>{l}<select value={s.feas[k]} onChange={e=>update(['feas',k],e.target.value)}>{levels.map(x=><option key={x}>{x}</option>)}</select></label>)}<label className="wide">Assessment Notes<textarea value={s.feas.notes} onChange={e=>update(['feas','notes'],e.target.value)} placeholder="Catat asumsi, risiko, evidence, dan mitigasi."/></label></div></section><section className="panel"><h3>Decision Brief</h3><div className="brief"><div><span>Technical</span><b>Can we build it?</b><p>Review technology familiarity, architecture, integration, security, performance, project size and technical risk.</p></div><div><span>Economic</span><b>Should we build it?</b><p>Biaya proyek saat ini {money(c.cost)}. Lanjutkan dengan benefit, NPV, ROI dan break-even sebagai lapisan ekonomi berikutnya.</p></div><div><span>Organizational</span><b>Will they use it?</b><p>Review strategic alignment, sponsor/champion support, user readiness and change/adoption risk.</p></div></div></section></>}

function when(iso){try{const d=new Date(iso);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(d)}catch{return ''}}
function fmt(n){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(num(n))}
function money(n){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(num(n))}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}

createRoot(document.getElementById('root')).render(<Boundary><App/></Boundary>);
