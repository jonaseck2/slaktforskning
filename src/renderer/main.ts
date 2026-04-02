import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from './i18n';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount('#app');

// Expose router for MCP ui_navigate tool
(window as Window & { __vue_router: typeof router }).__vue_router = router;
