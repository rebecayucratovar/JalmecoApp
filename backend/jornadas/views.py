from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Configuracion
from core.pausas import en_franja, franja_almuerzo, franjas_activas
from ubicaciones.consultas import distancia_km
from usuarios.permisos import EsTecnico
from verificaciones.models import Verificacion

from .models import Jornada
from .serializers import MiEstadoSerializer


class MiEstadoView(APIView):
    """GET /api/v1/mi/estado — estado de la jornada actual (pantalla Inicio de la app)."""

    permission_classes = [EsTecnico]

    def get(self, request):
        tecnico = request.user
        ahora = timezone.now()
        inicio_hoy = timezone.localtime(ahora).replace(hour=0, minute=0, second=0, microsecond=0)

        # Jornadas de hoy (hora La Paz) + la activa, aunque haya empezado ayer
        jornadas_hoy = list(
            Jornada.objects.filter(tecnico=tecnico)
            .filter(Q(inicio__gte=inicio_hoy) | Q(estado=Jornada.Estado.ACTIVA))
            .order_by('inicio')
        )
        activa = next((j for j in reversed(jornadas_hoy) if j.estado == Jornada.Estado.ACTIVA), None)

        minutos = sum(((j.fin or ahora) - j.inicio).total_seconds() for j in jornadas_hoy) // 60

        franjas = franjas_activas()
        almuerzo = franja_almuerzo(franjas)
        config = Configuracion.actual()
        ultima_verif = Verificacion.objects.filter(tecnico=tecnico).order_by('-solicitada_en').first()

        datos = MiEstadoSerializer({
            'en_jornada': activa is not None,
            'jornada': {'inicio': activa.inicio, 'horario': config.horario_texto} if activa else None,
            # Dentro de una franja de pausa habilitada la app no captura ni guarda puntos
            'en_pausa_almuerzo': en_franja(ahora, franjas),
            'franja_almuerzo': {'inicio': almuerzo.hora_inicio, 'fin': almuerzo.hora_fin} if almuerzo else None,
            'resumen_hoy': {
                'tiempo_jornada_min': int(minutos),
                'distancia_km': distancia_km(j.pk for j in jornadas_hoy),
            },
            # Cómo debe capturar la app (configurable en el panel)
            'rastreo': {'distancia_m': config.gps_distancia_m, 'intervalo_seg': config.gps_intervalo_seg},
            'ultima_verificacion': ultima_verif,
        })
        return Response(datos.data)
