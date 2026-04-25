import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from '../renderer/i18n';
import { installStaticApi } from './static-api';
import App from './App.vue';
import { vNarrate } from '../renderer/directives/narrate';
import '../renderer/styles/tokens.css';
import '../renderer/styles/shared.css';

await installStaticApi();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);
app.mount('#app');
