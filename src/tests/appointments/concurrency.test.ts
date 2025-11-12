import express from 'express';
import request from 'supertest';
import { strict as assert } from 'assert';

import DatabaseConnection from '../../shared/database/connection';
import { setupAppointmentsModule } from '../../modules/appointments';
import { JWTUtil } from '../../shared/utils/jwt.util';

interface SeedData {
  providerId: number;
  providerEmail: string;
  clientId: number;
  clientEmail: string;
  serviceId: number;
  isoDate: string;
  startTime: string;
}

function buildFutureDate(daysAhead: number = 7): string {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + daysAhead);
  return base.toISOString().slice(0, 10);
}

function getDayOfWeekLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const mapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return mapping[date.getDay()];
}

async function seedBaseData(): Promise<SeedData> {
  const pool = DatabaseConnection.getPool();
  const connection = await pool.getConnection();

  const providerEmail = `provider.concurrency.${Date.now()}@adomi.test`;
  const clientEmail = `client.concurrency.${Date.now()}@adomi.test`;
  const isoDate = buildFutureDate();
  const dayOfWeek = getDayOfWeekLabel(isoDate);

  try {
    await connection.beginTransaction();

    const [providerResult]: any = await connection.execute(
      `INSERT INTO users (name, email, role, is_active, email_verified)
       VALUES (?, ?, 'provider', 1, 1)`,
      ['Concurrency Provider', providerEmail]
    );
    const providerId = Number(providerResult.insertId);

    const [clientResult]: any = await connection.execute(
      `INSERT INTO users (name, email, role, is_active, email_verified)
       VALUES (?, ?, 'client', 1, 1)`,
      ['Concurrency Client', clientEmail]
    );
    const clientId = Number(clientResult.insertId);

    const [serviceResult]: any = await connection.execute(
      `INSERT INTO provider_services (provider_id, name, price, duration_minutes)
       VALUES (?, ?, ?, ?)`,
      [providerId, 'Prueba Concurrencia', 25000, 60]
    );
    const serviceId = Number(serviceResult.insertId);

    await connection.execute(
      `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, '08:00', '20:00', 1)`,
      [providerId, dayOfWeek]
    );

    await connection.commit();

    return {
      providerId,
      providerEmail,
      clientId,
      clientEmail,
      serviceId,
      isoDate,
      startTime: '10:00'
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanupData(seed: SeedData): Promise<void> {
  const pool = DatabaseConnection.getPool();

  await pool.query(
    'DELETE FROM appointments WHERE provider_id = ? AND `date` = ?',
    [seed.providerId, seed.isoDate]
  );

  await pool.query(
    'DELETE FROM provider_availability WHERE provider_id = ?',
    [seed.providerId]
  );

  await pool.query(
    'DELETE FROM provider_services WHERE id = ?',
    [seed.serviceId]
  );

  await pool.query(
    'DELETE FROM users WHERE id IN (?, ?)',
    [seed.providerId, seed.clientId]
  );
}

async function runConcurrencyTest(): Promise<void> {
  console.log('🧪 Iniciando prueba de concurrencia para /appointments');

  let seed: SeedData | null = null;

  try {
    seed = await seedBaseData();
  } catch (error) {
    console.error('❌ No se pudo preparar los datos base para la prueba de concurrencia.');
    throw error;
  }
  if (!seed) {
    throw new Error('Seed data not prepared');
  }
  const pool = DatabaseConnection.getPool();

  const app = express();
  app.use(express.json());
  setupAppointmentsModule(app);

  const { accessToken } = JWTUtil.generateTokenPair(seed.clientId, seed.clientEmail, 'client');
  const authHeader = `Bearer ${accessToken}`;

  const payload = {
    provider_id: seed.providerId,
    client_id: seed.clientId,
    service_id: seed.serviceId,
    date: seed.isoDate,
    start_time: seed.startTime,
    end_time: '11:00'
  };

  try {
    const [resA, resB] = await Promise.all([
      request(app).post('/appointments').set('Authorization', authHeader).send(payload),
      request(app).post('/appointments').set('Authorization', authHeader).send(payload)
    ]);

    const responses = [resA, resB];

    const successResponses = responses.filter(
      rsp => rsp.status === 200 && rsp.body?.success === true
    );
    const slotTakenResponses = responses.filter(
      rsp => rsp.status === 409 && rsp.body?.error === 'SLOT_TAKEN'
    );

    assert.equal(
      successResponses.length,
      1,
      `Se esperaba exactamente 1 respuesta exitosa, se recibieron ${successResponses.length} (statuses: ${responses.map(r => r.status).join(', ')})`
    );

    assert.equal(
      slotTakenResponses.length,
      1,
      `Se esperaba exactamente 1 respuesta SLOT_TAKEN, se recibieron ${slotTakenResponses.length} (statuses: ${responses.map(r => r.status).join(', ')})`
    );

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
         FROM appointments
        WHERE provider_id = ?
          AND \`date\` = ?
          AND \`start_time\` = ?`,
      [seed.providerId, seed.isoDate, seed.startTime]
    );

    const totalAppointments = Number(countRows?.[0]?.total ?? 0);
    assert.equal(
      totalAppointments,
      1,
      `La base de datos debería tener exactamente 1 cita para el slot. Actual: ${totalAppointments}`
    );

    console.log('✅ Prueba de concurrencia superada. Solo una cita fue creada y la otra devolvió SLOT_TAKEN.');
  } finally {
    if (seed) {
      await cleanupData(seed);
    }
  }
}

if (require.main === module) {
  runConcurrencyTest()
    .then(async () => {
      await DatabaseConnection.close();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('❌ Prueba de concurrencia falló:', error);
      await DatabaseConnection.close();
      process.exit(1);
    });
}

