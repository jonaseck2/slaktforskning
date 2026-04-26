import { createRouter, createWebHashHistory } from 'vue-router';
import RelationshipsView from './views/RelationshipsView.vue';
import SourcesView from './views/SourcesView.vue';
import SearchView from './views/SearchView.vue';

const LAST_ROUTE_KEY = 'slaktforskning-last-route';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    { path: '/visualisering', redirect: '/persons' },
    { path: '/visualisering/:personId', redirect: to => `/persons/${to.params.personId}` },
    { path: '/persons', component: () => import('./views/PersonsView.vue') },
    { path: '/persons/:personId', component: () => import('./views/PersonsView.vue') },
    { path: '/relationships', component: RelationshipsView },
    { path: '/relationships/:id', component: RelationshipsView },
    { path: '/sources', component: SourcesView },
    { path: '/sources/:id', component: SourcesView },
    { path: '/search', component: SearchView },
    { path: '/places', component: () => import('./views/PlacesView.vue') },
    { path: '/places/:id', component: () => import('./views/PlacesView.vue') },
    { path: '/settings', name: 'Settings', component: () => import('./views/SettingsView.vue') },
    { path: '/import-export', component: () => import('./views/ImportExportView.vue') },
    { path: '/database', redirect: '/settings' },
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
    { path: '/link-rules', redirect: '/settings' },
    { path: '/gazetteers', redirect: '/settings' },
  ],
});

router.afterEach((to) => {
  localStorage.setItem(LAST_ROUTE_KEY, to.fullPath);
});
