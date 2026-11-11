"""GET /dashboard — resumen del día para la pantalla Inicio del panel."""
from datetime import datetime, time, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from alertas.models import Alerta
from jornadas.models import Jornada
from usuarios.consultas import con_jornada
from usuarios.models import Tecnico
from usuarios.permisos import EsAdmin
from verificaciones.models import Verificacion

from .models import Configuracion
from .pausas import franjas_activas, minutos_utiles

DIAS_GRAFICO = 7


def _inicio_dia(fecha):
    return timezone.make_aware(datetime.combine(fecha, time(0, 0)))


def horas_en_campo(desde, hasta, ahora, franjas):
    """
    Por cada día [desde, hasta]: horas en jornada sumadas de todo el personal (sin el almuerzo)
    y cuántas personas trabajaron. Las jornadas abiertas cuentan hasta `ahora`.
    """
    ini, fin = _inicio_dia(desde), _inicio_dia(hasta + timedelta(days=1))
    jornadas = Jornada.objects.filter(inicio__lt=fin).filter(Q(fin__isnull=True) | Q(fin__gt=ini)) \
        .values_list('tecnico_id', 'inicio', 'fin')
    dias = {desde + timedelta(days=i): {'minutos': 0, 'personas': set()} for i in range((hasta - desde).days + 1)}
    for tecnico_id, j_ini, j_fin in jornadas:
        j_fin = min(j_fin or ahora, ahora)
        for dia, acumulado in dias.items():
            a, b = max(j_ini, _inicio_dia(dia)), min(j_fin, _inicio_dia(dia + timedelta(days=1)))
            if a < b:
                acumulado['minutos'] += minutos_utiles(a, b, franjas)
                acumulado['personas'].add(tecnico_id)
    return [{'fecha': dia.isoformat(), 'horas': round(v['minutos'] / 60, 1), 'personas': len(v['personas'])}
            for dia, v in dias.items()]


class DashboardView(APIView):
    permission_classes = [EsAdmin]

    def get(self, request):
        ahora = timezone.now()
        hoy = timezone.localdate(ahora)
        config = Configuracion.actual()
        activos = con_jornada(Tecnico.objects.filter(activo=True))

        en_jornada = [t for t in activos.filter(en_jornada=True).order_by('nombre')]
        estados = {e: 0 for e in (Tecnico.Estado.EN_TRAYECTO, Tecnico.Estado.EN_PARADA, Tecnico.Estado.SIN_CONEXION)}
        atencion = []
        for t in en_jornada:
            estado = t.estado_actual if t.estado_actual in estados else Tecnico.Estado.EN_PARADA
            estados[estado] += 1
            motivos = []
            if estado == Tecnico.Estado.SIN_CONEXION:
                motivos.append('sin_conexion')
            if t.ultima_bateria is not None and t.ultima_bateria < config.bateria_baja_pct:
                motivos.append('bateria_baja')
            if motivos:
                atencion.append({
                    'id': t.id, 'nombre': t.nombre, 'codigo': t.codigo, 'motivos': motivos,
                    'ultima_bateria': t.ultima_bateria, 'ultima_actualizacion': t.ultima_actualizacion,
                })

        inicio_hoy = _inicio_dia(hoy)
        verif = Verificacion.objects.filter(solicitada_en__gte=inicio_hoy).aggregate(
            pedidas=Count('id'),
            exito=Count('id', filter=Q(resultado=Verificacion.Resultado.EXITO)),
            no_realizadas=Count('id', filter=Q(resultado=Verificacion.Resultado.NO_REALIZADA)),
            pendientes=Count('id', filter=Q(resultado=Verificacion.Resultado.PENDIENTE)),
        )
        alertas = Alerta.objects.filter(estado=Alerta.Estado.NUEVA).aggregate(
            nuevas=Count('id'), criticas=Count('id', filter=Q(nivel=Alerta.Nivel.CRITICO)),
        )
        alertas['hoy'] = Alerta.objects.filter(creada_en__gte=inicio_hoy).count()

        return Response({
            'actualizado_en': ahora,
            'personal': {
                'activos': activos.count(),
                'en_jornada': len(en_jornada),
                'en_trayecto': estados[Tecnico.Estado.EN_TRAYECTO],
                'en_parada': estados[Tecnico.Estado.EN_PARADA],
                'sin_conexion': estados[Tecnico.Estado.SIN_CONEXION],
                'trabajaron_hoy': Jornada.objects.filter(inicio__gte=inicio_hoy).values('tecnico').distinct().count(),
                'sin_pin': activos.filter(pin_hash__isnull=True).count(),
            },
            'alertas': alertas,
            'verificaciones_hoy': verif,
            'atencion': atencion,
            'horas_campo': horas_en_campo(hoy - timedelta(days=DIAS_GRAFICO - 1), hoy, ahora, franjas_activas()),
        })
