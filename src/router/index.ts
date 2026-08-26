import { createRouter, createWebHistory } from 'vue-router'

import TodayView from '@/views/TodayView.vue'
import EvaluationView from '@/views/EvaluationView.vue'
import SupplementsView from '@/views/SupplementsView.vue'
import SettingsView from '@/views/SettingsView.vue'

// The four views from §16. Loaded eagerly: there are only four and the whole
// bundle is tiny, so code-splitting would add indirection for no gain yet.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/evaluation', name: 'evaluation', component: EvaluationView },
    { path: '/supplements', name: 'supplements', component: SupplementsView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

export default router
