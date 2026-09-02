import { createRouter, createWebHistory } from 'vue-router'

import DayView from '@/views/DayView.vue'
import LogView from '@/views/LogView.vue'
import EvaluationView from '@/views/EvaluationView.vue'
import SupplementsView from '@/views/SupplementsView.vue'
import SettingsView from '@/views/SettingsView.vue'

// The views from §16. Loaded eagerly: there are only a handful and the whole
// bundle is tiny, so code-splitting would add indirection for no gain yet.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'day', component: DayView },
    { path: '/log', name: 'log', component: LogView },
    { path: '/evaluation', name: 'evaluation', component: EvaluationView },
    { path: '/supplements', name: 'supplements', component: SupplementsView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

export default router
