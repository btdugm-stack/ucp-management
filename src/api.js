// Klien REST untuk api/ (PHP + MySQL).
//
// Basis URL sengaja relatif: saat hasil build dilayani Apache dari
// /ucp-management-local/, 'api/projects' menunjuk ke folder api di sebelahnya;
// saat pengembangan dengan Vite, permintaan yang sama diteruskan oleh proxy
// di vite.config.js. Tidak ada host yang perlu ditulis di kode.
const BASE=(import.meta.env?.VITE_API_BASE??'api').replace(/\/+$/,'');

export class ApiError extends Error{
 constructor(message,status,detail){super(message);this.name='ApiError';this.status=status;this.detail=detail}
}

async function request(path,options={}){
 let res;
 try{
  res=await fetch(`${BASE}${path}`,{headers:{'Content-Type':'application/json'},...options});
 }catch(cause){
  // fetch hanya menolak saat jaringan atau server benar-benar tidak terjangkau.
  throw new ApiError('Server API tidak dapat dihubungi. Pastikan Apache/PHP sedang berjalan.',0,String(cause?.message||cause));
 }
 const text=await res.text();
 let body=null;
 try{body=text?JSON.parse(text):null}catch{/* biarkan null, ditangani di bawah */}
 if(!res.ok){
  const message=body?.error||`Permintaan gagal dengan status ${res.status}.`;
  throw new ApiError(message,res.status,body?.detail||text.slice(0,300));
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
