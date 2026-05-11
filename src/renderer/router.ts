import { createRouter, createWebHashHistory } from 'vue-router';
import SourcesView from './views/SourcesView.vue';
import SearchView from './views/SearchView.vue';
import { STORAGE_KEYS } from './utils/storage-keys';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    { path: '/visualisering', redirect: '/persons' },
    { path: '/visualisering/:personId', redirect: to => `/persons/${to.params.personId}` },
    { path: '/persons', component: () => import('./views/PersonsView.vue') },
    { path: '/persons/:personId', component: () => import('./views/PersonsView.vue') },
    { path: '/relationships', redirect: '/persons' },
    { path: '/relationships/:id', redirect: '/persons' },
    { path: '/sources', component: SourcesView },
    { path: '/sources/:id', component: SourcesView },
    { path: '/search', component: SearchView },
    { path: '/places', component: () => import('./views/PlacesView.vue') },
    { path: '/places/:id', component: () => import('./views/PlacesView.vue') },
    { path: '/settings', name: 'Settings', component: () => import('./views/SettingsView.vue') },
    { path: '/import-export', component: () => import('./views/ImportExportView.vue') },
    { path: '/database', redirect: { path: '/settings', query: { tab: 'database' } } },
    { path: '/quality', component: () => import('./views/QualityView.vue') },
    { path: '/duplicates', component: () => import('./views/DuplicatesView.vue') },
    { path: '/reports', component: () => import('./views/ReportsView.vue'), props: { mode: 'keepsake' } },
    { path: '/prints', component: () => import('./views/ReportsView.vue'), props: { mode: 'framable' } },
    { path: '/website', component: () => import('./views/WebsiteExportView.vue') },
    { path: '/research-tasks', component: () => import('./views/ResearchTasksView.vue') },
    { path: '/research-tasks/:id', component: () => import('./views/ResearchTasksView.vue') },
    { path: '/groups', component: () => import('./views/GroupsView.vue') },
    { path: '/groups/:id', component: () => import('./views/GroupsView.vue') },
    { path: '/media', component: () => import('./views/MediaView.vue') },
    { path: '/map', redirect: '/places' },
    { path: '/link-rules', redirect: { path: '/settings', query: { tab: 'link-rules' } } },
    { path: '/gazetteers', redirect: { path: '/settings', query: { tab: 'gazetteers' } } },
  ],
});

router.afterEach((to) => {
  localStorage.setItem(STORAGE_KEYS.lastRoute, to.fullPath);
});
