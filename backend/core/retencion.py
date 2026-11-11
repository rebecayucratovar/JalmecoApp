"""Retención: borra los datos de rastreo más viejos que `retencion_meses` (la asistencia vive en Odoo)."""
import calendar

from django.utils import timezone

from alertas.models import Alerta
from jornadas.models import Jornada
from odoo_sync.models import SincronizacionOdoo
from ubicaciones.models import Parada, Ubicacion
from verificaciones.models import Verificacion

LOTE = 5000  # borrar de a poco: no bloquea la tabla ubicacion (la más grande) por mucho tiempo


def restar_meses(momento, meses):
    """`momento` menos N meses (si el día no existe, p. ej. 31 → el último día de ese mes)."""
    total = momento.year * 12 + (momento.month - 1) - meses
    anio, mes = divmod(total, 12)
    mes += 1
    dia = min(momento.day, calendar.monthrange(anio, mes)[1])
    return momento.replace(year=anio, month=mes, day=dia)


def _borrar_por_lotes(queryset):
    borrados = 0
    while True:
        ids = list(queryset.values_list('pk', flat=True)[:LOTE])
        if not ids:
            return borrados
        borrados += queryset.model.objects.filter(pk__in=ids).delete()[0]


def limpiar(meses, ahora=None):
    """Borra lo anterior al corte. Devuelve {tabla: filas borradas} (solo las que tuvieron algo)."""
    ahora = ahora or timezone.now()
    corte = restar_meses(ahora, meses)
    resultado = {
        # Primero los hijos: así borrar la jornada no arrastra millones de puntos de una sola vez
        'ubicacion': _borrar_por_lotes(Ubicacion.objects.filter(registrado_en__lt=corte)),
        'parada': _borrar_por_lotes(Parada.objects.filter(inicio__lt=corte)),
        'verificacion': _borrar_por_lotes(Verificacion.objects.filter(solicitada_en__lt=corte)),
        'alerta': _borrar_por_lotes(Alerta.objects.filter(creada_en__lt=corte)),
        # Jornadas que terminaron antes del corte (sus puntos ya se borraron arriba)
        'jornada': _borrar_por_lotes(Jornada.objects.filter(estado=Jornada.Estado.CERRADA, fin__lt=corte)),
        'sincronizacion_odoo': _borrar_por_lotes(SincronizacionOdoo.objects.filter(fecha__lt=corte)),
    }
    return {tabla: n for tabla, n in resultado.items() if n}
