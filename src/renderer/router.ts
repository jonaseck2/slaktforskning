import { createRouter, createWebHashHistory } from 'vue-router';
import PersonsView from './views/PersonsView.vue';
import PersonDetailView from './views/PersonDetailView.vue';
import RelationshipsView from './views/RelationshipsView.vue';
import RelationshipDetailView from './views/RelationshipDetailView.vue';
import SourcesView from './views/SourcesView.vue';
import SourceDetailView from './views/SourceDetailView.vue';
import SearchView from './views/SearchView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PersonsView },
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
  ],
});
