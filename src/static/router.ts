import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    {
      path: '/persons',
      component: () => import('./views/PersonsListView.vue'),
    },
    {
      path: '/persons/:id',
      component: () => import('./views/PersonDetailView.vue'),
    },
    {
      path: '/places',
      component: () => import('./views/PlacesListView.vue'),
    },
    {
      path: '/places/:id',
      component: () => import('./views/PlaceDetailView.vue'),
    },
    {
      path: '/media',
      component: () => import('../renderer/views/MediaView.vue'),
    },
    {
      path: '/search',
      component: () => import('../renderer/views/SearchView.vue'),
    },
  ],
});
