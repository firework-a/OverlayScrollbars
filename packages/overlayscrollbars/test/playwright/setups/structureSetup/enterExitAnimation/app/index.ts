import { createApp } from 'vue';
import App from './App.vue';

export const mountApp = (element: HTMLElement) => {
  createApp(App).mount(element);
};
