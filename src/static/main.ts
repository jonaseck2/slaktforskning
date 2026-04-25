import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../renderer/i18n';
import { vNarrate } from '../renderer/directives/narrate';
import '../renderer/styles/tokens.css';
import '../renderer/styles/shared.css';
import { router } from './router';
import { installStaticApi } from './static-api';
import App from './App.vue';

await installStaticApi();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);
app.mount('#app');
