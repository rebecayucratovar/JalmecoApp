from datetime import timedelta

from django.contrib.gis.geos import Point
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, Subquery
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


def _jornadas_del_lote(tecnico, puntos_validos):
    """Jornadas (activas o cerradas) del técnico que se cruzan con el rango de horas del lote."""
    if not puntos_validos:
        return []
    momentos = [p['registrado_en'] for p in puntos_validos]
    return list(
        Jornada.objects.filter(tecnico=tecnico, inicio__lte=max(momentos))
        .filter(Q(fin__isnull=True) | Q(fin__gte=min(momentos)))
        .order_by('inicio')
    )


def _jornada_de(momento, jornadas):
    """
    La jornada que contiene `momento` (inicio ≤ momento ≤ fin; si sigue activa, sin fin).
    Así se guardan también los puntos offline que llegan después de cerrada la jornada.
    """
    for j in jornadas:
        if j.inicio <= momento and (j.fin is None or momento <= j.fin):
            return j
    return None


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
        ultima_velocidad=ultimo.velocidad,
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
        franjas = franjas_activas()

        # 1) Validar formato de cada punto (uno malo no tumba el lote)
        validos, rechazados = [], 0
        for crudo in lote.validated_data['puntos']:
            punto = PuntoSerializer(data=crudo)
            if punto.is_valid() and punto.validated_data['registrado_en'] <= ahora + TOLERANCIA_FUTURO:
                validos.append(punto.validated_data)
            else:
                rechazados += 1

        # 2) Ligar cada punto a SU jornada (activa o ya cerrada); fuera de jornada o en pausa → rechazo
        jornadas = _jornadas_del_lote(tecnico, validos)
        nuevas = []
        for p in validos:
            jornada = _jornada_de(p['registrado_en'], jornadas)
            if jornada is None or en_franja(p['registrado_en'], franjas):
                rechazados += 1
                continue
            nuevas.append(Ubicacion(
                tecnico=tecnico,
                jornada=jornada,
                punto=Point(p['lng'], p['lat'], srid=4326),  # Point(x=lng, y=lat)
                precision_m=p.get('precision_m'),
                velocidad=p.get('velocidad'),
                bateria=p.get('bateria'),
                registrado_en=p['registrado_en'],
            ))

        # 3) Guardar. El "último estado" (mapa en vivo) solo se mueve con puntos de la jornada
        #    ACTIVA: un punto atrasado de una jornada cerrada no debe mostrar al técnico en campo.
        if nuevas:
            de_activa = [u for u in nuevas if u.jornada.estado == Jornada.Estado.ACTIVA]
            with transaction.atomic():
                Ubicacion.objects.bulk_create(nuevas)
                if de_activa:
                    _actualizar_ultimo_estado(tecnico, max(de_activa, key=lambda u: u.registrado_en))

        respuesta = RespuestaUbicacionesSerializer({'recibidos': len(nuevas), 'rechazados': rechazados})
        return Response(respuesta.data)


class MapaEnVivoView(APIView):
    """
    GET /api/v1/mapa-en-vivo — todo el personal activo. Los que están en jornada vienen con su
    última posición; los que no, como "fuera_jornada" y SIN ubicación (privacidad).
    """

    permission_classes = [EsAdmin]

    def get(self, request):
        jornada_activa = Jornada.objects.filter(tecnico=OuterRef('pk'), estado=Jornada.Estado.ACTIVA)
        tecnicos = (Tecnico.objects.filter(activo=True)
                    .annotate(en_jornada=Exists(jornada_activa), jornada_inicio=Subquery(jornada_activa.values('inicio')[:1]))
                    .order_by('nombre'))
        datos = MapaEnVivoSerializer({'actualizado_en': timezone.now(), 'tecnicos': tecnicos})
        return Response(datos.data)
