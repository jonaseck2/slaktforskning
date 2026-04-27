import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from './i18n';
import './styles/tokens.css';
import './styles/shared.css';
import App from './App.vue';
import { vNarrate } from './directives/narrate';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);

const lastRoute = localStorage.getItem('slaktforskning-last-route');
const hasHashRoute = window.location.hash && window.location.hash !== '#/';
if (lastRoute && lastRoute !== '/' && !hasHashRoute) {
  router.push(lastRoute).catch(() => router.push('/'));
}

router.isReady().finally(() => app.mount('#app'));

// Expose router and i18n for MCP ui_navigate tool and E2E locale switching
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_router = router;
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_i18n = i18n;
