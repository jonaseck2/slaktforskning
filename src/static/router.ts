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
      path: '/reports',
      component: () => import('./views/ReportsIndexView.vue'),
    },
    {
      path: '/reports/:slug',
      component: () => import('./views/ReportPageView.vue'),
    },
    {
      path: '/prints',
      component: () => import('./views/PrintsIndexView.vue'),
    },
    {
      path: '/prints/:slug',
      component: () => import('./views/PrintPageView.vue'),
    },
    {
      path: '/search',
      component: () => import('../renderer/views/SearchView.vue'),
    },
  ],
});
