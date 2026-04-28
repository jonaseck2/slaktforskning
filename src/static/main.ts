import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../renderer/i18n';
import { vNarrate } from '../renderer/directives/narrate';
import '../renderer/styles/tokens.css';
import '../renderer/styles/shared.css';
import { router } from './router';
import { installStaticApi } from './static-api';
import App from './App.vue';

// Vue Router 4 rejects superseded/cancelled navigations with `undefined`.
// When the user clicks a router-link before the previous push resolves
// (common during boot under file:// where layout/load races are tighter)
// the rejection bubbles up as "Uncaught (in promise) undefined" with a
// stack pointing into Nz.v.cancel. Functionally harmless but noisy in
// devtools. Silence only the bare-`undefined` rejection — anything with
// a real reason still surfaces.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason === undefined) e.preventDefault();
});

await installStaticApi();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);
app.mount('#app');
