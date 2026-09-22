import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// base relatif agar hasil build bisa dilayani dari subfolder mana pun
// (mis. di bawah document root Laragon) tanpa mengubah konfigurasi.
// Saat pengembangan, permintaan /api diteruskan ke backend PHP; index.php
// memotong segmen /api sendiri sehingga path tidak perlu ditulis ulang.
export default defineConfig({
 base:'./',
 plugins:[react()],
 server:{
  proxy:{
   '/api':{target:process.env.UCP_API_PROXY||'http://127.0.0.1:8787',changeOrigin:true}
  }
 },
 build:{outDir:'dist',sourcemap:true}
});
