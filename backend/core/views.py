"""GET/PUT /config — configuración del sistema desde el panel (reemplaza al admin de Django)."""
from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from usuarios.permisos import EsAdmin

from .models import Configuracion, FranjaPausa
from .pausas import almuerzo_configurado
from .serializers import ConfiguracionSerializer


class ConfiguracionView(APIView):
    """GET /config · PUT /config (solo los campos enviados)."""

    permission_classes = [EsAdmin]

    def get(self, request):
        return Response(ConfiguracionSerializer(Configuracion.actual()).data)

    def put(self, request):
        with transaction.atomic():
            config = Configuracion.objects.select_for_update().get(pk=Configuracion.actual().pk)
            datos = ConfiguracionSerializer(config, data=request.data, partial=True)
            datos.is_valid(raise_exception=True)
            datos.save()
            nuevo = datos.validated_data.get('almuerzo')
            if nuevo:
                franja = almuerzo_configurado() or FranjaPausa(nombre='Almuerzo')
                franja.hora_inicio, franja.hora_fin, franja.activa = nuevo['inicio'], nuevo['fin'], True
                franja.save()
        return Response(ConfiguracionSerializer(config).data)
