"""Endpoints del panel admin para el personal: lista, ficha, alta, edición y PIN."""
import secrets

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .consultas import con_jornada
from .models import Tecnico
from .permisos import EsAdmin
from .serializers import PinGeneradoSerializer, TecnicoAdminSerializer, TecnicoEscrituraSerializer


def generar_pin():
    """PIN de 6 dígitos al azar (seguro), evitando los fáciles de adivinar (111111, 123456, 654321…)."""
    while True:
        pin = f'{secrets.randbelow(1_000_000):06d}'
        pasos = {int(b) - int(a) for a, b in zip(pin, pin[1:])}
        if len(set(pin)) > 1 and pasos not in ({1}, {-1}):
            return pin


def _ficha(pk):
    return Response(TecnicoAdminSerializer(get_object_or_404(con_jornada(), pk=pk)).data)


class TecnicosView(APIView):
    """GET /tecnicos (todo el personal, activos e inactivos) · POST /tecnicos (alta manual)."""

    permission_classes = [EsAdmin]

    def get(self, request):
        tecnicos = con_jornada().order_by('nombre')
        return Response({'tecnicos': TecnicoAdminSerializer(tecnicos, many=True).data})

    def post(self, request):
        datos = TecnicoEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        tecnico = datos.save()  # sin PIN: el admin lo genera aparte (se muestra una sola vez)
        respuesta = _ficha(tecnico.pk)
        respuesta.status_code = status.HTTP_201_CREATED
        return respuesta


class TecnicoView(APIView):
    """GET /tecnicos/{id} · PUT /tecnicos/{id} (solo los campos enviados)."""

    permission_classes = [EsAdmin]

    def get(self, request, pk):
        return _ficha(pk)

    def put(self, request, pk):
        tecnico = get_object_or_404(Tecnico, pk=pk)
        datos = TecnicoEscrituraSerializer(tecnico, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        datos.save()
        return _ficha(pk)


class TecnicoPinView(APIView):
    """
    POST /tecnicos/{id}/pin — genera o reinicia el PIN. La respuesta es la ÚNICA vez que se ve.
    Las sesiones abiertas con el PIN anterior dejan de valer (ver autenticacion.sesion_revocada).
    """

    permission_classes = [EsAdmin]

    def post(self, request, pk):
        with transaction.atomic():
            tecnico = get_object_or_404(Tecnico.objects.select_for_update(), pk=pk)
            pin = generar_pin()
            tecnico.set_pin(pin)
            tecnico.save(update_fields=['pin_hash', 'pin_generado_en'])
        return Response(PinGeneradoSerializer({'pin': pin, 'generado_en': tecnico.pin_generado_en}).data)
