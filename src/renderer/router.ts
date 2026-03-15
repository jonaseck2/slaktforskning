import { createRouter, createWebHashHistory } from 'vue-router';
import PersonsView from './views/PersonsView.vue';
import PersonDetailView from './views/PersonDetailView.vue';
import FamiliesView from './views/FamiliesView.vue';
import FamilyDetailView from './views/FamilyDetailView.vue';
import SourcesView from './views/SourcesView.vue';
import SourceDetailView from './views/SourceDetailView.vue';
import SearchView from './views/SearchView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PersonsView },
    { path: '/persons/:id', component: PersonDetailView },
    { path: '/families', component: FamiliesView },
    { path: '/families/:id', component: FamilyDetailView },
    { path: '/sources', component: SourcesView },
    { path: '/sources/:id', component: SourceDetailView },
    { path: '/search', component: SearchView },
  ],
});
