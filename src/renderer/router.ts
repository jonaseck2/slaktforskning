import { createRouter, createWebHashHistory } from 'vue-router';
import PersonDetailView from './views/PersonDetailView.vue';
import RelationshipsView from './views/RelationshipsView.vue';
import RelationshipDetailView from './views/RelationshipDetailView.vue';
import SourcesView from './views/SourcesView.vue';
import SourceDetailView from './views/SourceDetailView.vue';
import SearchView from './views/SearchView.vue';

const LAST_ROUTE_KEY = 'slaktforskning-last-route';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/visualisering' },
    { path: '/persons/:id', component: PersonDetailView },
    { path: '/relationships', component: RelationshipsView },
    { path: '/relationships/:id', component: RelationshipDetailView },
    { path: '/sources', component: SourcesView },
    { path: '/sources/:id', component: SourceDetailView },
    { path: '/search', component: SearchView },
    { path: '/places', component: () => import('./views/PlacesView.vue') },
    { path: '/places/:id', component: () => import('./views/PlaceDetailView.vue') },
    { path: '/visualisering', component: () => import('./views/VisualizationView.vue') },
    { path: '/visualisering/:personId', component: () => import('./views/VisualizationView.vue') },
    { path: '/settings', name: 'Settings', component: () => import('./views/SettingsView.vue') },
    { path: '/import-export', component: () => import('./views/ImportExportView.vue') },
    { path: '/database', redirect: '/settings' },
    { path: '/quality', component: () => import('./views/QualityView.vue') },
    { path: '/reports', component: () => import('./views/ReportsView.vue'), props: { mode: 'keepsake' } },
    { path: '/prints', component: () => import('./views/ReportsView.vue'), props: { mode: 'framable' } },
    { path: '/website', component: () => import('./views/WebsiteExportView.vue') },
    { path: '/research-tasks', component: () => import('./views/ResearchTasksView.vue') },
    { path: '/groups', component: () => import('./views/GroupsView.vue') },
    { path: '/groups/:id', component: () => import('./views/GroupDetailView.vue') },
    { path: '/media', component: () => import('./views/MediaView.vue') },
    { path: '/map', redirect: '/places' },
    { path: '/link-rules', redirect: '/settings' },
    { path: '/gazetteers', redirect: '/settings' },
  ],
});

router.afterEach((to) => {
  localStorage.setItem(LAST_ROUTE_KEY, to.fullPath);
});
