import express from 'express';
import cors from 'cors';
import { setupAppointmentsModule } from './modules/appointments/index';
import { setupPaymentsWebhooks } from './modules/payments/webhooks';
import { buildAppointmentCheckoutRoutes } from './modules/payments/routes/appointment-checkout.routes';
import { setupReviewsModule } from './modules/reviews/index';
import { setupFavoritesModule } from './modules/favorites/index';

console.log('='.repeat(80));
console.log('🚀 ADOMI BACKEND - VERSIÓN CON MÓDULOS DE REVIEWS Y FAVORITES');
console.log('📅 Fecha de despliegue:', new Date().toISOString());
console.log('📁 Archivo principal: backend/src/index.ts');
console.log('='.repeat(80));
console.log('[SERVER] 🚀 Iniciando servidor Adomi...');

const app = express();
app.use(cors());
app.use(express.json());

console.log('[SERVER] 🔧 Configurando módulos...');

// Utilidad: listar rutas registradas (para depuración en despliegue)
function listRegisteredRoutes(appRef: any): Array<{ method: string; path: string }> {
  const collected: Array<{ method: string; path: string }> = [];
  const stack = appRef && appRef._router && appRef._router.stack ? appRef._router.stack : [];

  const collectFromLayer = (layer: any, prefix = '') => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).filter(k => !!layer.route.methods[k]);
      collected.push({ method: methods.join(',').toUpperCase() || 'ALL', path: prefix + layer.route.path });
    } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
      const sub = layer.handle.stack;
      sub.forEach((l: any) => collectFromLayer(l, prefix));
    }
  };

  stack.forEach((layer: any) => collectFromLayer(layer));
  try {
    console.log(`[SERVER] 📚 Rutas registradas (${collected.length})`);
    collected.forEach(r => console.log(`[ROUTE] ${r.method} ${r.path}`));
  } catch {}
  return collected;
}

// Modules
console.log('[SERVER] 📅 Configurando módulo de appointments...');
setupAppointmentsModule(app);

console.log('[SERVER] 💳 Configurando módulo de payments...');
setupPaymentsWebhooks(app);
app.use('/', buildAppointmentCheckoutRoutes());

console.log('[SERVER] ⭐ Configurando módulo de reviews...');
setupReviewsModule(app);

console.log('[SERVER] ❤️ Configurando módulo de favorites...');
setupFavoritesModule(app);

console.log('[SERVER] ✅ Todos los módulos configurados correctamente');

// Endpoint de depuración para ver rutas registradas en producción
app.get('/__debug/routes', (_req, res) => {
  const routes = listRegisteredRoutes(app);
  res.json({ success: true, total: routes.length, routes });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('='.repeat(80));
  console.log('✅ ADOMI BACKEND INICIADO CORRECTAMENTE');
  console.log(`🌐 Servidor escuchando en puerto ${port}`);
  console.log(`🔗 URL: http://localhost:${port}`);
  console.log('📊 ENDPOINTS DISPONIBLES:');
  console.log('   ✅ POST /reviews - Crear reseñas');
  console.log('   ✅ GET /client/favorites - Listar favoritos');
  console.log('   ✅ GET /provider/appointments/pending-requests - Citas pendientes');
  console.log('   ✅ GET /provider/appointments/next - Próxima cita');
  console.log('='.repeat(80));
  console.log(`[SERVER] ✅ Servidor Adomi completamente iniciado - ${new Date().toISOString()}`);
  // Imprimir rutas una vez iniciado
  listRegisteredRoutes(app);
});


