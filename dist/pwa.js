// Register the offline worker. Fails quietly where service workers are unavailable (file://, private modes).
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
