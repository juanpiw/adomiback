import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { ipRateLimit } from '../middleware/rate-limit';
import { validateContentType, validatePayloadSize, sanitizeInput } from '../middleware/validation';
import {
  createBooking,
  getBookingById,
  getBookingWithDetails,
  getBookingsByClient,
  getBookingsByProvider,
  updateBookingStatus,
  getBookingsByDateRange,
  checkProviderAvailability,
  getBookingStats,
  deleteBooking
} from '../queries/bookings';

const router = Router();

// Rate limiting para bookings
const bookingLimit = ipRateLimit(20, 15 * 60 * 1000); // 20 intentos cada 15 minutos
const adminLimit = ipRateLimit(50, 15 * 60 * 1000); // 50 intentos cada 15 minutos para admin

/**
 * POST /bookings - Crear nueva reserva
 * Requiere autenticación como cliente
 */
router.post('/',
  authenticateToken,
  bookingLimit,
  validateContentType(['application/json']),
  validatePayloadSize(10 * 1024), // 10KB max
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][CREATE] Nueva solicitud de reserva');
    
    const { provider_id, provider_service_id, booking_time, final_price, notes_from_client } = req.body;
    const user = (req as any).user;

    // Solo clientes pueden crear reservas
    if (user.role !== 'client') {
      console.warn('[BOOKINGS][CREATE] Usuario no es cliente:', user.role);
      return res.status(403).json({ success: false, error: 'Solo los clientes pueden crear reservas.' });
    }

    // Validar datos requeridos
    if (!provider_id || !provider_service_id || !booking_time || !final_price) {
      console.warn('[BOOKINGS][CREATE] Datos faltantes');
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan datos requeridos: provider_id, provider_service_id, booking_time, final_price' 
      });
    }

    try {
      // Verificar disponibilidad del proveedor
      const isAvailable = await checkProviderAvailability(provider_id, new Date(booking_time));
      if (!isAvailable) {
        console.warn('[BOOKINGS][CREATE] Horario no disponible para proveedor:', provider_id);
        return res.status(409).json({ 
          success: false, 
          error: 'El horario seleccionado no está disponible.' 
        });
      }

      // Crear la reserva
      const bookingId = await createBooking({
        client_id: user.id,
        provider_id: parseInt(provider_id),
        provider_service_id: parseInt(provider_service_id),
        booking_time: new Date(booking_time),
        final_price: parseFloat(final_price),
        notes_from_client: sanitizeInput(notes_from_client)
      });

      console.log('[BOOKINGS][CREATE] Reserva creada exitosamente:', bookingId);

      // Obtener detalles de la reserva creada
      const booking = await getBookingWithDetails(bookingId);
      
      res.status(201).json({
        success: true,
        message: 'Reserva creada exitosamente.',
        booking: booking
      });

    } catch (error: any) {
      console.error('[BOOKINGS][CREATE][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * GET /bookings - Obtener reservas del usuario autenticado
 */
router.get('/',
  authenticateToken,
  bookingLimit,
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][LIST] Solicitud de listado de reservas');
    
    const user = (req as any).user;
    const { status, start_date, end_date } = req.query;

    try {
      let bookings;
      
      if (user.role === 'client') {
        // Cliente ve sus propias reservas
        bookings = await getBookingsByClient(user.id, status as string);
      } else if (user.role === 'provider') {
        // Proveedor ve las reservas de sus servicios
        bookings = await getBookingsByProvider(user.id, status as string);
      } else {
        return res.status(403).json({ success: false, error: 'Rol de usuario no válido.' });
      }

      // Filtrar por rango de fechas si se especifica
      if (start_date && end_date) {
        const start = new Date(start_date as string);
        const end = new Date(end_date as string);
        bookings = bookings.filter(booking => 
          booking.booking_time >= start && booking.booking_time <= end
        );
      }

      console.log('[BOOKINGS][LIST] Reservas encontradas:', bookings.length);
      
      res.json({
        success: true,
        bookings: bookings,
        count: bookings.length
      });

    } catch (error: any) {
      console.error('[BOOKINGS][LIST][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * GET /bookings/:id - Obtener reserva específica
 */
router.get('/:id',
  authenticateToken,
  bookingLimit,
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][GET] Solicitud de reserva específica:', req.params.id);
    
    const bookingId = parseInt(req.params.id);
    const user = (req as any).user;

    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, error: 'ID de reserva inválido.' });
    }

    try {
      const booking = await getBookingWithDetails(bookingId);
      
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Reserva no encontrada.' });
      }

      // Verificar que el usuario tenga acceso a esta reserva
      const hasAccess = user.role === 'client' && booking.client_id === user.id ||
                       user.role === 'provider' && booking.provider_id === user.id;

      if (!hasAccess) {
        console.warn('[BOOKINGS][GET] Acceso denegado para usuario:', user.id);
        return res.status(403).json({ success: false, error: 'No tienes acceso a esta reserva.' });
      }

      console.log('[BOOKINGS][GET] Reserva encontrada:', bookingId);
      
      res.json({
        success: true,
        booking: booking
      });

    } catch (error: any) {
      console.error('[BOOKINGS][GET][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * PUT /bookings/:id/status - Actualizar estado de reserva
 */
router.put('/:id/status',
  authenticateToken,
  bookingLimit,
  validateContentType(['application/json']),
  validatePayloadSize(5 * 1024), // 5KB max
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][UPDATE_STATUS] Actualización de estado de reserva:', req.params.id);
    
    const bookingId = parseInt(req.params.id);
    const { status, notes_from_provider } = req.body;
    const user = (req as any).user;

    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, error: 'ID de reserva inválido.' });
    }

    // Validar estado
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_provider', 'no_show'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado inválido. Estados válidos: ' + validStatuses.join(', ') 
      });
    }

    try {
      // Obtener la reserva para verificar permisos
      const booking = await getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Reserva no encontrada.' });
      }

      // Verificar permisos según el estado
      let canUpdate = false;
      
      if (user.role === 'client') {
        // Cliente puede cancelar su propia reserva
        canUpdate = booking.client_id === user.id && 
                   (status === 'cancelled_by_client' || status === 'pending');
      } else if (user.role === 'provider') {
        // Proveedor puede confirmar, completar o cancelar reservas de sus servicios
        canUpdate = booking.provider_id === user.id && 
                   ['confirmed', 'completed', 'cancelled_by_provider', 'no_show'].includes(status);
      }

      if (!canUpdate) {
        console.warn('[BOOKINGS][UPDATE_STATUS] Permisos insuficientes para usuario:', user.id);
        return res.status(403).json({ 
          success: false, 
          error: 'No tienes permisos para actualizar esta reserva con el estado especificado.' 
        });
      }

      // Actualizar el estado
      const result = await updateBookingStatus(
        bookingId, 
        status, 
        user.role === 'provider' ? sanitizeInput(notes_from_provider) : undefined
      );

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      console.log('[BOOKINGS][UPDATE_STATUS] Estado actualizado exitosamente:', bookingId, 'a', status);
      
      // Obtener la reserva actualizada
      const updatedBooking = await getBookingWithDetails(bookingId);
      
      res.json({
        success: true,
        message: 'Estado de reserva actualizado exitosamente.',
        booking: updatedBooking
      });

    } catch (error: any) {
      console.error('[BOOKINGS][UPDATE_STATUS][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * GET /bookings/availability/:provider_id - Verificar disponibilidad del proveedor
 */
router.get('/availability/:provider_id',
  authenticateToken,
  bookingLimit,
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][AVAILABILITY] Verificación de disponibilidad para proveedor:', req.params.provider_id);
    
    const providerId = parseInt(req.params.provider_id);
    const { date, time } = req.query;

    if (isNaN(providerId)) {
      return res.status(400).json({ success: false, error: 'ID de proveedor inválido.' });
    }

    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Faltan parámetros: date y time son requeridos.' });
    }

    try {
      const bookingTime = new Date(`${date}T${time}`);
      const isAvailable = await checkProviderAvailability(providerId, bookingTime);
      
      console.log('[BOOKINGS][AVAILABILITY] Disponibilidad verificada:', isAvailable);
      
      res.json({
        success: true,
        available: isAvailable,
        provider_id: providerId,
        booking_time: bookingTime.toISOString()
      });

    } catch (error: any) {
      console.error('[BOOKINGS][AVAILABILITY][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * GET /bookings/stats - Obtener estadísticas de reservas
 */
router.get('/stats',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][STATS] Solicitud de estadísticas de reservas');
    
    const user = (req as any).user;
    const { provider_id } = req.query;

    try {
      // Solo proveedores pueden ver sus propias estadísticas
      if (user.role === 'provider' && provider_id && parseInt(provider_id) !== user.id) {
        return res.status(403).json({ success: false, error: 'No puedes ver estadísticas de otros proveedores.' });
      }

      const stats = await getBookingStats(provider_id ? parseInt(provider_id as string) : undefined);
      
      console.log('[BOOKINGS][STATS] Estadísticas obtenidas:', stats);
      
      res.json({
        success: true,
        stats: stats,
        period: provider_id ? 'provider' : 'global'
      });

    } catch (error: any) {
      console.error('[BOOKINGS][STATS][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

/**
 * DELETE /bookings/:id - Eliminar reserva (solo para casos especiales)
 */
router.delete('/:id',
  authenticateToken,
  bookingLimit,
  async (req: Request, res: Response) => {
    console.log('[BOOKINGS][DELETE] Solicitud de eliminación de reserva:', req.params.id);
    
    const bookingId = parseInt(req.params.id);
    const user = (req as any).user;

    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, error: 'ID de reserva inválido.' });
    }

    try {
      // Obtener la reserva para verificar permisos
      const booking = await getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Reserva no encontrada.' });
      }

      // Solo el cliente puede eliminar su propia reserva si está pendiente
      if (user.role !== 'client' || booking.client_id !== user.id || booking.status !== 'pending') {
        return res.status(403).json({ 
          success: false, 
          error: 'Solo puedes eliminar tus propias reservas pendientes.' 
        });
      }

      const result = await deleteBooking(bookingId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      console.log('[BOOKINGS][DELETE] Reserva eliminada exitosamente:', bookingId);
      
      res.json({
        success: true,
        message: 'Reserva eliminada exitosamente.'
      });

    } catch (error: any) {
      console.error('[BOOKINGS][DELETE][ERROR]', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  }
);

export default router;
