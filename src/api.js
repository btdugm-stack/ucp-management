// Klien REST untuk api/ (PHP + MySQL).
//
// Basis URL sengaja relatif: saat hasil build dilayani Apache dari
// /ucp-management-local/, 'api/projects' menunjuk ke folder api di sebelahnya;
// saat pengembangan dengan Vite, permintaan yang sama diteruskan oleh proxy
// di vite.config.js. Tidak ada host yang perlu ditulis di kode.
const BASE=(import.meta.env?.VITE_API_BASE??'api').replace(/\/+$/,'');

// kind memisahkan "backend PHP tidak jalan" dari "MySQL tidak jalan".
// Keduanya tampak serupa dari sisi browser padahal langkah perbaikannya
// berbeda, dan menyebut keduanya sebagai masalah database menyesatkan.
export class ApiError extends Error{
 constructor(message,status,detail,kind='server'){super(message);this.name='ApiError';this.status=status;this.detail=detail;this.kind=kind}
}

async function request(path,options={}){
 let res;
 try{
  res=await fetch(`${BASE}${path}`,{headers:{'Content-Type':'application/json'},...options});
 }catch(cause){
  // fetch hanya menolak saat jaringan atau server benar-benar tidak terjangkau.
  throw new ApiError('Server API tidak dapat dihubungi sama sekali.',0,String(cause?.message||cause),'backend');
 }
 const text=await res.text();
 let body=null;
 try{body=text?JSON.parse(text):null}catch{/* biarkan null, ditangani di bawah */}
 if(!res.ok){
  // 502/504 datang dari proxy atau web server ketika PHP tidak menjawab;
  // 503 datang dari api/index.php sendiri ketika MySQL tidak terjangkau.
  const kind=res.status===503?'database':(res.status===502||res.status===504||res.status===404)?'backend':'server';
  const fallback=kind==='backend'
   ?`Backend PHP tidak menjawab (status ${res.status}).`
   :`Permintaan gagal dengan status ${res.status}.`;
  throw new ApiError(body?.error||fallback,res.status,body?.detail||text.slice(0,300),kind);
 }
 if(body===null)throw new ApiError('Balasan server bukan JSON yang valid.',res.status,text.slice(0,300));
 return body;
}

export const health=()=>request('/health');
export const listProjects=async()=>(await request('/projects')).projects??[];
export const getProject=async id=>(await request(`/projects/${id}`)).project;
export const createProject=async state=>(await request('/projects',{method:'POST',body:JSON.stringify(state)})).project;
export const saveProject=async(id,state)=>(await request(`/projects/${id}`,{method:'PUT',body:JSON.stringify(state)})).project;
export const duplicateProject=async id=>(await request(`/projects/${id}/duplicate`,{method:'POST'})).project;
export const deleteProject=id=>request(`/projects/${id}`,{method:'DELETE'});

// Laporan dikembalikan sebagai berkas biner, bukan JSON, sehingga permintaan
// ini tidak melewati request() yang selalu mengurai JSON.
export async function buildReport(format,spec){
 let res;
 try{
  res=await fetch(`${BASE}/report/${format}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(spec)});
 }catch(cause){
  throw new ApiError('Server API tidak dapat dihubungi sama sekali.',0,String(cause?.message||cause),'backend');
 }
 if(!res.ok){
  const teks=await res.text();
  let body=null;
  try{body=JSON.parse(teks)}catch{}
  const kind=res.status===503?'database':(res.status===502||res.status===504||res.status===404)?'backend':'server';
  throw new ApiError(body?.error||`Laporan gagal dibuat (status ${res.status}).`,res.status,body?.detail||teks.slice(0,300),kind);
 }
 const blob=await res.blob();
 if(!blob.size)throw new ApiError('Berkas laporan kosong.',res.status,'','server');
 return blob;
}
