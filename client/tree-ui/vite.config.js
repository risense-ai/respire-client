import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({plugins:[viteSingleFile()],base:'./',build:{assetsInlineLimit:100000}});
