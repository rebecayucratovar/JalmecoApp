from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import APIView

from usuarios.permisos import EsTecnico

from . import servicios
from .models import Verificacion
from .serializers import ResponderVerificacionSerializer, VerificacionPendienteSerializer


class Conflicto(exceptions.APIException):
    status_code = 409
    default_code = 'conflicto'


def _limite():
    return servicios.limite()


class MiVerificacionPendienteView(APIView):
    """GET /api/v1/mi/verificacion-pendiente — la solicitud de huella vigente, si hay."""

    permission_classes = [EsTecnico]

    def get(self, request):
        limite = _limite()
        v = (
            Verificacion.objects.filter(
                tecnico=request.user, resultado=Verificacion.Resultado.PENDIENTE,
                solicitada_en__gt=timezone.now() - limite,
            )
            .order_by('-solicitada_en').first()
        )
        if v is None:
            return Response(VerificacionPendienteSerializer({'pendiente': False}).data)
        return Response(VerificacionPendienteSerializer({
            'pendiente': True, 'verificacion_id': v.pk, 'solicitada_en': v.solicitada_en,
            'vence_en': v.solicitada_en + limite, 'limite_min': int(limite.total_seconds() // 60),
        }).data)


class MiResponderVerificacionView(APIView):
    """POST /api/v1/mi/verificaciones/{id}/responder { resultado: "exito", lat?, lng? }"""

    permission_classes = [EsTecnico]

    def post(self, request, pk):
        datos = ResponderVerificacionSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        ahora = timezone.now()

        with transaction.atomic():
            v = Verificacion.objects.select_for_update().filter(pk=pk, tecnico=request.user).first()
            if v is None:
                raise exceptions.NotFound('Verificación no encontrada.', code='no_encontrada')
            if v.resultado != Verificacion.Resultado.PENDIENTE:
                raise Conflicto('Esta verificación ya fue respondida o cerrada.', code='ya_respondida')
            if ahora > v.solicitada_en + _limite():
                raise Conflicto('El tiempo para verificar ya venció.', code='verificacion_vencida')

            lat, lng = datos.validated_data.get('lat'), datos.validated_data.get('lng')
            v.resultado = Verificacion.Resultado.EXITO
            v.respondida_en = ahora
            if lat is not None and lng is not None:
                v.punto = Point(lng, lat, srid=4326)
            v.save(update_fields=['resultado', 'respondida_en', 'punto'])
        return Response({'ok': True})
