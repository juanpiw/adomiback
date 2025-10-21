import express from 'express';
import cors from 'cors';
import { setupAppointmentsModule } from './modules/appointments/index';
import { setupPaymentsWebhooks } from './modules/payments/webhooks';
import { buildAppointmentCheckoutRoutes } from './modules/payments/routes/appointment-checkout.routes';
import { setupReviewsModule } from './modules/reviews/index';
import { setupFavoritesModule } from './modules/favorites/index';

const app = express();
app.use(cors());
app.use(express.json());

// Modules
setupAppointmentsModule(app);
setupPaymentsWebhooks(app);
app.use('/', buildAppointmentCheckoutRoutes());
setupReviewsModule(app);
setupFavoritesModule(app);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[SERVER] Listening on ${port}`);
});


