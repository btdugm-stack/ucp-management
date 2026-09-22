import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// base relatif agar hasil build bisa dilayani dari subfolder mana pun
// (mis. di bawah document root Laragon) tanpa mengubah konfigurasi.
export default defineConfig({
 base:'./',
 plugins:[react()],
 build:{outDir:'dist',sourcemap:true}
});
