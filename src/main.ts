import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Fonts are bundled rather than fetched from a CDN: the app has to render
// correctly offline (§13), and a CDN would also mean a third-party request
// per user. Sans is the variable build, so one file covers 400/500/600.
// Mono is used only for hero figures (§15), hence just two static weights.
// Only the latin subsets get precached — see globPatterns in vite.config.ts.
// The font-family declarations themselves live in theme/tokens.css.
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
