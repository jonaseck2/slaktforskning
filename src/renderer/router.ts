import { createRouter, createWebHashHistory } from 'vue-router';
import PersonsView from './views/PersonsView.vue';
import FamiliesView from './views/FamiliesView.vue';
import SourcesView from './views/SourcesView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PersonsView },
    { path: '/families', component: FamiliesView },
    { path: '/sources', component: SourcesView },
  ],
});
