import { defineConfig, type Plugin } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** The PNG combat masters remain available to the asset tools, not the shipped game. */
function deliveryPublicFiles(): Plugin {
  return {
    name: 'delivery-public-files', apply: 'build',
    async generateBundle() {
      const publicRoot=resolve('public');
      const copy=async(directory:string,prefix=''):Promise<void>=>{
        for(const entry of await readdir(directory,{withFileTypes:true})) {
          const name=prefix+entry.name;
          if(name==='combat')continue;
          const path=resolve(directory,entry.name);
          if(entry.isDirectory())await copy(path,`${name}/`);
          else if(entry.isFile())this.emitFile({type:'asset',fileName:name,source:await readFile(path)});
        }
      };
      await copy(publicRoot);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [deliveryPublicFiles()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    copyPublicDir: false,
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});
