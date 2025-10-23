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
});


