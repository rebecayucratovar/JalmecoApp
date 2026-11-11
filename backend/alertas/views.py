"""Bandeja de alertas del panel."""
from datetime import datetime, time, timedelta

from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from jornadas.models import Jornada
from usuarios.permisos import EsAdmin

from .models import Alerta
from .serializers import AlertaSerializer, FiltroAlertasSerializer

DIAS_POR_DEFECTO = 7
MAX_ALERTAS = 500


def _inicio_del_dia(fecha):
    return timezone.make_aware(datetime.combine(fecha, time(0, 0)))


def _con_tecnico(qs):
    activa = Jornada.objects.filter(tecnico=OuterRef('tecnico'), estado=Jornada.Estado.ACTIVA)
    return qs.select_related('tecnico', 'atendida_por').annotate(tecnico_en_jornada=Exists(activa))


def _serializar(alertas):
    for a in alertas:
        a.tecnico.en_jornada = a.tecnico_en_jornada
    return AlertaSerializer(alertas, many=True).data


class AlertasView(APIView):
    """
    GET /alertas?estado=&tipo=&tecnico=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
    Por defecto, los últimos 7 días. `conteo` respeta las fechas, el tipo y la persona (no el estado),
    para las pestañas Todas / Nuevas / Atendidas.
    """

    permission_classes = [EsAdmin]

    def get(self, request):
        filtro = FiltroAlertasSerializer(data=request.query_params)
        filtro.is_valid(raise_exception=True)
        f = filtro.validated_data
        hoy = timezone.localdate()
        desde = f.get('desde') or hoy - timedelta(days=DIAS_POR_DEFECTO - 1)
        hasta = f.get('hasta') or hoy

        qs = Alerta.objects.filter(creada_en__gte=_inicio_del_dia(desde),
                                   creada_en__lt=_inicio_del_dia(hasta + timedelta(days=1)))
        if 'tipo' in f:
            qs = qs.filter(tipo=f['tipo'])
        if 'tecnico' in f:
            qs = qs.filter(tecnico_id=f['tecnico'])
        conteo = qs.aggregate(todas=Count('id'), nuevas=Count('id', filter=Q(estado=Alerta.Estado.NUEVA)))
        conteo['atendidas'] = conteo['todas'] - conteo['nuevas']
        if 'estado' in f:
            qs = qs.filter(estado=f['estado'])

        alertas = list(_con_tecnico(qs).order_by('-creada_en')[:MAX_ALERTAS])
        return Response({'desde': desde, 'hasta': hasta, 'conteo': conteo, 'alertas': _serializar(alertas),
                         'limitado': len(alertas) == MAX_ALERTAS})


class ResumenAlertasView(APIView):
    """GET /alertas/resumen — alertas nuevas (sin atender) de cualquier fecha: para la campana."""

    permission_classes = [EsAdmin]

    def get(self, request):
        nuevas = Alerta.objects.filter(estado=Alerta.Estado.NUEVA)
        return Response({
            'nuevas': nuevas.count(),
            'criticas': nuevas.filter(nivel=Alerta.Nivel.CRITICO).count(),
            'ultimas': _serializar(list(_con_tecnico(nuevas).order_by('-creada_en')[:5])),
        })


def _atender(qs, admin):
    return qs.filter(estado=Alerta.Estado.NUEVA).update(
        estado=Alerta.Estado.ATENDIDA, atendida_por=admin, atendida_en=timezone.now())


class AtenderAlertaView(APIView):
    """POST /alertas/{id}/atender"""

    permission_classes = [EsAdmin]

    def post(self, request, pk):
        get_object_or_404(Alerta, pk=pk)
        _atender(Alerta.objects.filter(pk=pk), request.user)
        alerta = _con_tecnico(Alerta.objects.filter(pk=pk)).get()
        return Response(_serializar([alerta])[0])


class AtenderTodasView(APIView):
    """POST /alertas/atender-todas  { "ids": [..] }? — sin ids: todas las nuevas."""

    permission_classes = [EsAdmin]

    def post(self, request):
        qs = Alerta.objects.all()
        ids = request.data.get('ids') if isinstance(request.data, dict) else None
        if isinstance(ids, list):
            qs = qs.filter(pk__in=[i for i in ids if isinstance(i, int)])
        return Response({'atendidas': _atender(qs, request.user)})
