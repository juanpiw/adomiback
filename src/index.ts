import express from 'express';
import cors from 'cors';
import { setupAppointmentsModule } from './modules/appointments/index';
import { setupPaymentsWebhooks } from './modules/payments/webhooks';
import { buildAppointmentCheckoutRoutes } from './modules/payments/routes/appointment-checkout.routes';
import { setupReviewsModule } from './modules/reviews/index';
import { setupFavoritesModule } from './modules/favorites/index';

console.log('[SERVER] 🚀 Iniciando servidor Adomi...');
console.log('[SERVER] 📁 Archivo principal: backend/src/index.ts');

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
  console.log(`[SERVER] 🌐 Servidor escuchando en puerto ${port}`);
  console.log(`[SERVER] 🔗 URL: http://localhost:${port}`);
  console.log(`[SERVER] 📊 Endpoints disponibles:`);
  console.log(`[SERVER]   - POST /reviews`);
  console.log(`[SERVER]   - GET /client/favorites`);
  console.log(`[SERVER]   - GET /provider/appointments/pending-requests`);
  console.log(`[SERVER]   - GET /provider/appointments/next`);
  console.log(`[SERVER] ✅ Servidor Adomi completamente iniciado`);
});


