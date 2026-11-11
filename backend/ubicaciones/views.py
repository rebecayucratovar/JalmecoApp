from datetime import timedelta

from django.contrib.gis.geos import Point
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pausas import en_franja, franjas_activas
from jornadas.models import Jornada
from usuarios.models import Tecnico
from usuarios.permisos import EsAdmin, EsTecnico

from .models import Ubicacion
from .serializers import (
    LoteUbicacionesSerializer, MapaEnVivoSerializer, PuntoSerializer, RespuestaUbicacionesSerializer,
)

# Regla simple de estado: a partir de esta velocidad se considera "en trayecto"
VELOCIDAD_TRAYECTO_KMH = 5.0
# Tolerancia para relojes de celular adelantados
TOLERANCIA_FUTURO = timedelta(minutes=5)


def _rechazar(punto, jornada, franjas, ahora):
    """True si el punto no debe guardarse (fuera de jornada, en pausa o con hora imposible)."""
    momento = punto['registrado_en']
    return (
        jornada is None
        or momento < jornada.inicio
        or momento > ahora + TOLERANCIA_FUTURO
        or en_franja(momento, franjas)
    )


def _estado_por_velocidad(velocidad):
    if velocidad is not None and velocidad >= VELOCIDAD_TRAYECTO_KMH:
        return Tecnico.Estado.EN_TRAYECTO
    return Tecnico.Estado.EN_PARADA


def _actualizar_ultimo_estado(tecnico, ultimo):
    """Actualiza los campos ultima_* solo si el punto es más nuevo que lo ya guardado."""
    Tecnico.objects.filter(pk=tecnico.pk).filter(
        Q(ultima_actualizacion__isnull=True) | Q(ultima_actualizacion__lte=ultimo.registrado_en)
    ).update(
        ultima_lat=ultimo.punto.y,
        ultima_lng=ultimo.punto.x,
        ultima_bateria=ultimo.bateria,
        ultima_actualizacion=ultimo.registrado_en,
        estado_actual=_estado_por_velocidad(ultimo.velocidad),
    )


class MisUbicacionesView(APIView):
    """POST /api/v1/mi/ubicaciones — lote de puntos GPS del técnico autenticado."""

    permission_classes = [EsTecnico]

    def post(self, request):
        lote = LoteUbicacionesSerializer(data=request.data)
        lote.is_valid(raise_exception=True)

        tecnico = request.user
        ahora = timezone.now()
        jornada = (
            Jornada.objects.filter(tecnico=tecnico, estado=Jornada.Estado.ACTIVA).order_by('-inicio').first()
        )
        franjas = franjas_activas()

        nuevas, rechazados = [], 0
        for crudo in lote.validated_data['puntos']:
            punto = PuntoSerializer(data=crudo)
            if not punto.is_valid() or _rechazar(punto.validated_data, jornada, franjas, ahora):
                rechazados += 1
                continue
            p = punto.validated_data
            nuevas.append(Ubicacion(
                tecnico=tecnico,
                jornada=jornada,
                punto=Point(p['lng'], p['lat'], srid=4326),  # Point(x=lng, y=lat)
                precision_m=p.get('precision_m'),
                velocidad=p.get('velocidad'),
                bateria=p.get('bateria'),
                registrado_en=p['registrado_en'],
            ))

        if nuevas:
            with transaction.atomic():
                Ubicacion.objects.bulk_create(nuevas)
                _actualizar_ultimo_estado(tecnico, max(nuevas, key=lambda u: u.registrado_en))

        respuesta = RespuestaUbicacionesSerializer({'recibidos': len(nuevas), 'rechazados': rechazados})
        return Response(respuesta.data)


class MapaEnVivoView(APIView):
    """GET /api/v1/mapa-en-vivo — técnicos con jornada activa y su última posición."""

    permission_classes = [EsAdmin]

    def get(self, request):
        jornada_activa = Jornada.objects.filter(tecnico=OuterRef('pk'), estado=Jornada.Estado.ACTIVA)
        tecnicos = Tecnico.objects.filter(Exists(jornada_activa), activo=True).order_by('nombre')
        datos = MapaEnVivoSerializer({'actualizado_en': timezone.now(), 'tecnicos': tecnicos})
        return Response(datos.data)
