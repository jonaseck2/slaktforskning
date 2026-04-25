import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    { path: '/persons', component: () => import('../renderer/views/PersonsView.vue') },
    { path: '/persons/:personId', component: () => import('../renderer/views/PersonsView.vue') },
    { path: '/places', component: () => import('../renderer/views/PlacesView.vue') },
    { path: '/places/:id', component: () => import('../renderer/views/PlacesView.vue') },
    { path: '/media', component: () => import('../renderer/views/MediaView.vue') },
    { path: '/search', component: () => import('../renderer/views/SearchView.vue') },
  ],
});
