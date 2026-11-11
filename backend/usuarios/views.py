from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from alertas.models import Alerta

from .autenticacion import emitir_tokens, renovar_access
from .models import Administrador, Tecnico
from .permisos import EsTecnico
from .serializers import (
    MOTIVOS_SEGUIMIENTO, DispositivoRespuestaSerializer, DispositivoSerializer,
    LoginAdminRespuestaSerializer, LoginAdminSerializer, LoginTecnicoRespuestaSerializer,
    LoginTecnicoSerializer, MiPerfilSerializer, RefreshRespuestaSerializer, RefreshSerializer,
    SeguimientoDetenidoRespuestaSerializer, SeguimientoDetenidoSerializer,
)
from .throttles import LoginPorIPThrottle, LoginPorUsuarioThrottle


def _credenciales_invalidas():
    return exceptions.AuthenticationFailed('Credenciales inválidas.', code='credenciales_invalidas')


class _VistaPublica(APIView):
    """Endpoints sin token (login/refresh), con límite de intentos."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginPorUsuarioThrottle, LoginPorIPThrottle]

    def get_authenticate_header(self, request):
        # Sin clases de autenticación DRF convertiría el 401 en 403; credenciales malas = 401
        return 'Bearer'


class LoginAdminView(_VistaPublica):
    """POST /api/v1/auth/admin/login  { email, password }"""

    def post(self, request):
        datos = LoginAdminSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        admin = Administrador.objects.filter(email__iexact=datos.validated_data['email'], activo=True).first()
        if admin is None or not admin.check_password(datos.validated_data['password']):
            raise _credenciales_invalidas()
        return Response(LoginAdminRespuestaSerializer({**emitir_tokens(admin), 'admin': admin}).data)


class LoginTecnicoView(_VistaPublica):
    """POST /api/v1/auth/tecnico/login  { usuario, pin } — `usuario` acepta el usuario o el código JAL-XXXX."""

    def post(self, request):
        datos = LoginTecnicoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        ident = datos.validated_data['usuario'].strip()
        tecnico = (
            Tecnico.objects.filter(Q(usuario__iexact=ident) | Q(codigo__iexact=ident), activo=True)
            .order_by('id').first()
        )
        if tecnico is None or not tecnico.check_pin(datos.validated_data['pin']):
            raise _credenciales_invalidas()
        return Response(LoginTecnicoRespuestaSerializer({**emitir_tokens(tecnico), 'tecnico': tecnico}).data)


class RefreshView(_VistaPublica):
    """POST /api/v1/auth/refresh  { refresh } → { access }"""

    def post(self, request):
        datos = RefreshSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        access = renovar_access(datos.validated_data['refresh'])
        return Response(RefreshRespuestaSerializer({'access': access}).data)


# ---------- App móvil (rol técnico) ----------

def politicas_app():
    """Reglas que la app muestra y aplica (horario, almuerzo, retención, captura GPS)."""
    from core.models import Configuracion
    from core.pausas import franja_almuerzo, franjas_activas

    config = Configuracion.actual()
    almuerzo = franja_almuerzo(franjas_activas())
    return {
        'horario': config.horario_texto,
        'franja_almuerzo': {'inicio': almuerzo.hora_inicio, 'fin': almuerzo.hora_fin} if almuerzo else None,
        'retencion_meses': config.retencion_meses,
        'verificaciones_por_dia': config.verificaciones_por_dia,
        'rastreo': {'distancia_m': config.gps_distancia_m, 'intervalo_seg': config.gps_intervalo_seg},
    }


class MiPerfilView(APIView):
    """GET /api/v1/mi/perfil — datos del técnico y políticas (pantalla Perfil)."""

    permission_classes = [EsTecnico]

    def get(self, request):
        return Response(MiPerfilSerializer({'tecnico': request.user, 'politicas': politicas_app()}).data)


class MiDispositivoView(APIView):
    """
    PUT /api/v1/mi/dispositivo — equipo detectado por la app (al iniciar sesión y al abrirla).

    - Primera vez (sin equipo registrado): se guarda, sin alerta.
    - Mismo equipo: solo se refresca el modelo.
    - Otro equipo: se registra el nuevo y se crea una alerta `cambio_equipo` (cambio de celular
      o intento de usar otro equipo para evadir el GPS).
    """

    permission_classes = [EsTecnico]

    def put(self, request):
        datos = DispositivoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        nuevo_id = datos.validated_data['equipo_id'].strip()
        nuevo_modelo = datos.validated_data['equipo_modelo'].strip()

        with transaction.atomic():
            tecnico = Tecnico.objects.select_for_update().get(pk=request.user.pk)
            anterior_id, anterior_modelo = tecnico.equipo_id, tecnico.equipo_modelo
            cambio = bool(anterior_id) and anterior_id != nuevo_id

            tecnico.equipo_modelo = nuevo_modelo
            if anterior_id != nuevo_id:
                tecnico.equipo_id = nuevo_id
                tecnico.equipo_registrado_en = timezone.now()
            tecnico.save(update_fields=['equipo_id', 'equipo_modelo', 'equipo_registrado_en'])

            if cambio:
                Alerta.objects.create(
                    tecnico=tecnico, tipo=Alerta.Tipo.CAMBIO_EQUIPO, nivel=Alerta.Nivel.CRITICO,
                    mensaje=f'Inició sesión desde otro celular: {nuevo_modelo} '
                            f'(antes: {anterior_modelo or "sin modelo"}).',
                )
        return Response(DispositivoRespuestaSerializer({'ok': True, 'cambio_equipo': cambio}).data)


class MiSeguimientoDetenidoView(APIView):
    """
    POST /api/v1/mi/seguimiento-detenido { motivo } — la app avisa que dejará de rastrear
    (cerrar sesión, quitar permiso, apagar GPS). Solo genera alerta si hay jornada activa.
    """

    permission_classes = [EsTecnico]

    def post(self, request):
        from jornadas.models import Jornada

        datos = SeguimientoDetenidoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        tecnico = request.user
        en_jornada = Jornada.objects.filter(tecnico=tecnico, estado=Jornada.Estado.ACTIVA).exists()
        if en_jornada:
            Alerta.objects.create(
                tecnico=tecnico, tipo=Alerta.Tipo.SEGUIMIENTO_DETENIDO, nivel=Alerta.Nivel.CRITICO,
                mensaje=f'{MOTIVOS_SEGUIMIENTO[datos.validated_data["motivo"]]}.',
            )
        return Response(SeguimientoDetenidoRespuestaSerializer({'ok': True, 'alerta_creada': en_jornada}).data)
