import { pool, executeQuery } from '../lib/db';

export type BookingRow = {
  id: number;
  client_id: number;
  provider_id: number;
  provider_service_id: number;
  booking_time: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled_by_client' | 'cancelled_by_provider' | 'no_show';
  final_price: number;
  notes_from_client: string | null;
  notes_from_provider: string | null;
  created_at: Date;
  updated_at: Date;
};

export type BookingWithDetails = BookingRow & {
  client_name: string;
  client_email: string;
  provider_name: string;
  provider_email: string;
  service_name: string;
  service_description: string;
  service_price: number;
};

/**
 * Crear una nueva reserva
 */
export async function createBooking(data: {
  client_id: number;
  provider_id: number;
  provider_service_id: number;
  booking_time: Date;
  final_price: number;
  notes_from_client?: string;
}): Promise<number> {
  const [result] = await executeQuery(
    'INSERT INTO bookings (client_id, provider_id, provider_service_id, booking_time, final_price, notes_from_client) VALUES (?, ?, ?, ?, ?, ?)',
    [data.client_id, data.provider_id, data.provider_service_id, data.booking_time, data.final_price, data.notes_from_client || null]
  );
  // @ts-ignore
  return result.insertId as number;
}

/**
 * Obtener reserva por ID
 */
export async function getBookingById(id: number): Promise<BookingRow | null> {
  const [rows] = await executeQuery('SELECT * FROM bookings WHERE id = ? LIMIT 1', [id]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as BookingRow) : null;
}

/**
 * Obtener reserva por ID con detalles completos
 */
export async function getBookingWithDetails(id: number): Promise<BookingWithDetails | null> {
  const [rows] = await executeQuery(`
    SELECT 
      b.*,
      c.name as client_name,
      c.email as client_email,
      p.name as provider_name,
      p.email as provider_email,
      ps.name as service_name,
      ps.description as service_description,
      ps.price as service_price
    FROM bookings b
    JOIN users c ON b.client_id = c.id
    JOIN users p ON b.provider_id = p.id
    JOIN provider_services ps ON b.provider_service_id = ps.id
    WHERE b.id = ?
  `, [id]);
  
  const arr = rows as any[];
  return arr.length ? (arr[0] as BookingWithDetails) : null;
}

/**
 * Obtener todas las reservas de un cliente
 */
export async function getBookingsByClient(clientId: number, status?: string): Promise<BookingWithDetails[]> {
  let query = `
    SELECT 
      b.*,
      c.name as client_name,
      c.email as client_email,
      p.name as provider_name,
      p.email as provider_email,
      ps.name as service_name,
      ps.description as service_description,
      ps.price as service_price
    FROM bookings b
    JOIN users c ON b.client_id = c.id
    JOIN users p ON b.provider_id = p.id
    JOIN provider_services ps ON b.provider_service_id = ps.id
    WHERE b.client_id = ?
  `;
  
  const params: any[] = [clientId];
  
  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY b.booking_time DESC';
  
  const [rows] = await executeQuery(query, params);
  return rows as BookingWithDetails[];
}

/**
 * Obtener todas las reservas de un proveedor
 */
export async function getBookingsByProvider(providerId: number, status?: string): Promise<BookingWithDetails[]> {
  let query = `
    SELECT 
      b.*,
      c.name as client_name,
      c.email as client_email,
      p.name as provider_name,
      p.email as provider_email,
      ps.name as service_name,
      ps.description as service_description,
      ps.price as service_price
    FROM bookings b
    JOIN users c ON b.client_id = c.id
    JOIN users p ON b.provider_id = p.id
    JOIN provider_services ps ON b.provider_service_id = ps.id
    WHERE b.provider_id = ?
  `;
  
  const params: any[] = [providerId];
  
  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY b.booking_time DESC';
  
  const [rows] = await executeQuery(query, params);
  return rows as BookingWithDetails[];
}

/**
 * Actualizar estado de una reserva
 */
export async function updateBookingStatus(
  bookingId: number, 
  status: BookingRow['status'], 
  notesFromProvider?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const params: any[] = [status, bookingId];
    let query = 'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    if (notesFromProvider !== undefined) {
      query = 'UPDATE bookings SET status = ?, notes_from_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      params.splice(1, 0, notesFromProvider);
    }
    
    await executeQuery(query, params);
    console.log('[BOOKINGS][UPDATE_STATUS] Booking status updated:', bookingId, 'to', status);
    return { success: true };
  } catch (error: any) {
    console.error('[BOOKINGS][UPDATE_STATUS][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener reservas por rango de fechas
 */
export async function getBookingsByDateRange(
  startDate: Date, 
  endDate: Date, 
  providerId?: number
): Promise<BookingWithDetails[]> {
  let query = `
    SELECT 
      b.*,
      c.name as client_name,
      c.email as client_email,
      p.name as provider_name,
      p.email as provider_email,
      ps.name as service_name,
      ps.description as service_description,
      ps.price as service_price
    FROM bookings b
    JOIN users c ON b.client_id = c.id
    JOIN users p ON b.provider_id = p.id
    JOIN provider_services ps ON b.provider_service_id = ps.id
    WHERE b.booking_time >= ? AND b.booking_time <= ?
  `;
  
  const params: any[] = [startDate, endDate];
  
  if (providerId) {
    query += ' AND b.provider_id = ?';
    params.push(providerId);
  }
  
  query += ' ORDER BY b.booking_time ASC';
  
  const [rows] = await executeQuery(query, params);
  return rows as BookingWithDetails[];
}

/**
 * Verificar disponibilidad de horario para un proveedor
 */
export async function checkProviderAvailability(
  providerId: number, 
  bookingTime: Date
): Promise<boolean> {
  const [rows] = await executeQuery(
    'SELECT id FROM bookings WHERE provider_id = ? AND booking_time = ? AND status IN (?, ?, ?)',
    [providerId, bookingTime, 'pending', 'confirmed', 'completed']
  );
  
  const arr = rows as any[];
  return arr.length === 0; // Disponible si no hay reservas conflictivas
}

/**
 * Obtener estadísticas de reservas
 */
export async function getBookingStats(providerId?: number): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  revenue: number;
}> {
  let query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status IN ('cancelled_by_client', 'cancelled_by_provider') THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END) as revenue
    FROM bookings
  `;
  
  const params: any[] = [];
  
  if (providerId) {
    query += ' WHERE provider_id = ?';
    params.push(providerId);
  }
  
  const [rows] = await executeQuery(query, params);
  const arr = rows as any[];
  return arr.length ? arr[0] : {
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0
  };
}

/**
 * Eliminar reserva (solo para casos especiales)
 */
export async function deleteBooking(bookingId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await executeQuery('DELETE FROM bookings WHERE id = ?', [bookingId]);
    console.log('[BOOKINGS][DELETE] Booking deleted:', bookingId);
    return { success: true };
  } catch (error: any) {
    console.error('[BOOKINGS][DELETE][ERROR]', error);
    return { success: false, error: error.message };
  }
}


