import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' makes asset paths relative, so the site works under GitHub Pages' /SkillSwap/ path (or any other).
export default defineConfig({ base: './', plugins: [react()] })
