"""Estado de la integración con Odoo (pantalla Configuración → Integración Odoo)."""
from django.conf import settings
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Configuracion
from usuarios.permisos import EsAdmin

from .cliente import ClienteOdoo, ErrorOdoo
from .models import SincronizacionOdoo

MAX_HISTORIAL = 20
VARIABLES = ['ODOO_URL', 'ODOO_DB', 'ODOO_USUARIO', 'ODOO_API_KEY']


class SincronizacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SincronizacionOdoo
        fields = ['id', 'fecha', 'tipo', 'resultado', 'registros', 'mensaje']


class OdooEstadoView(APIView):
    """
    GET /odoo/estado — datos de conexión (nunca la clave API), qué variables faltan en
    backend/.env, la última sincronización correcta y el historial reciente.
    """

    permission_classes = [EsAdmin]

    def get(self, request):
        historial = SincronizacionOdoo.objects.order_by('-fecha')[:MAX_HISTORIAL]
        return Response({
            'url': settings.ODOO_URL or None,
            'db': settings.ODOO_DB or None,
            'usuario': settings.ODOO_USUARIO or None,
            'faltan': [v for v in VARIABLES if not getattr(settings, v)],
            'ultima_sync_ok': Configuracion.actual().odoo_ultima_sync_ok,
            'historial': SincronizacionSerializer(historial, many=True).data,
        })


class OdooProbarView(APIView):
    """POST /odoo/probar — conecta y se autentica (solo lectura). ← { ok, version | mensaje }."""

    permission_classes = [EsAdmin]

    def post(self, request):
        try:
            odoo = ClienteOdoo(timeout=15)
            version = odoo.version().get('server_version')
            odoo.autenticar()
        except ErrorOdoo as e:
            return Response({'ok': False, 'mensaje': str(e)})
        return Response({'ok': True, 'version': version, 'mensaje': f'Conectado como {odoo.usuario}.'})
