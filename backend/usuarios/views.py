from rest_framework import exceptions
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .autenticacion import emitir_tokens, renovar_access
from .models import Administrador, Tecnico
from .serializers import (
    LoginAdminRespuestaSerializer, LoginAdminSerializer, LoginTecnicoRespuestaSerializer,
    LoginTecnicoSerializer, RefreshRespuestaSerializer, RefreshSerializer,
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
    """POST /api/v1/auth/tecnico/login  { usuario, pin }"""

    def post(self, request):
        datos = LoginTecnicoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        tecnico = Tecnico.objects.filter(usuario=datos.validated_data['usuario'], activo=True).first()
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
