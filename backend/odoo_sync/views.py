"""Estado de la integración con Odoo (pantalla Configuración → Integración Odoo)."""
from django.conf import settings
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Configuracion
from usuarios.permisos import EsAdmin

from . import servicios
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


def _respuesta_error(e):
    return Response({'error': str(e), 'codigo': 'ODOO_ERROR'}, status=status.HTTP_502_BAD_GATEWAY)


class OdooEmpleadosView(APIView):
    """GET /odoo/empleados — empleados activos de Odoo, para elegir a quién importar."""

    permission_classes = [EsAdmin]

    def get(self, request):
        try:
            empleados = servicios.empleados_odoo(ClienteOdoo())
        except ErrorOdoo as e:
            return _respuesta_error(e)
        return Response({'empleados': empleados})


class ImportarSerializer(serializers.Serializer):
    odoo_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=300)


class ImportarOdooView(APIView):
    """
    POST /tecnicos/importar-odoo { odoo_ids } — crea (o pone al día) a esas personas y trae sus
    asistencias recientes, para que quien ya marcó entrada aparezca en jornada.
    """

    permission_classes = [EsAdmin]

    def post(self, request):
        datos = ImportarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            odoo = ClienteOdoo()
            resultado = servicios.importar(odoo, datos.validated_data['odoo_ids'])
            SincronizacionOdoo.registrar(SincronizacionOdoo.Tipo.EMPLEADOS,
                                         registros=resultado['importados'] + resultado['vinculados'])
            servicios.tarea_asistencia_ahora(odoo)
        except ErrorOdoo as e:
            return _respuesta_error(e)
        return Response(resultado)


class OdooSincronizarView(APIView):
    """POST /odoo/sincronizar — trae ya la asistencia y los datos del personal (sin esperar al worker)."""

    permission_classes = [EsAdmin]

    def post(self, request):
        try:
            odoo = ClienteOdoo(timeout=20)
            empleados = servicios.actualizar_empleados(odoo)
            SincronizacionOdoo.registrar(SincronizacionOdoo.Tipo.EMPLEADOS, registros=empleados)
            jornadas = servicios.tarea_asistencia_ahora(odoo)
        except ErrorOdoo as e:
            return Response({'ok': False, 'mensaje': str(e)})
        return Response({'ok': True, 'jornadas': jornadas, 'empleados': empleados})
