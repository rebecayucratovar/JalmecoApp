"""
Autenticación JWT para los modelos propios Administrador y Tecnico.

Los tokens (access + refresh) se emiten con djangorestframework-simplejwt y llevan dos claims:
    uid  → id del Administrador o del Tecnico
    tipo → "admin" | "tecnico"
"""
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import Administrador, Tecnico

TIPO_ADMIN = Administrador.TIPO_USUARIO      # "admin"
TIPO_TECNICO = Tecnico.TIPO_USUARIO          # "tecnico"

MODELOS_POR_TIPO = {
    TIPO_ADMIN: Administrador,
    TIPO_TECNICO: Tecnico,
}


def emitir_tokens(usuario):
    """Devuelve {'access', 'refresh'} para un Administrador o Tecnico."""
    refresh = RefreshToken()
    refresh['uid'] = usuario.pk
    refresh['tipo'] = usuario.TIPO_USUARIO
    # El access copia los claims del refresh (uid y tipo)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def cargar_usuario(tipo, uid):
    """Devuelve el usuario activo correspondiente al token, o None."""
    modelo = MODELOS_POR_TIPO.get(tipo)
    if modelo is None or uid is None:
        return None
    return modelo.objects.filter(pk=uid, activo=True).first()


def sesion_revocada(usuario, token):
    """
    True si el token es anterior al último PIN generado: al reiniciar el PIN de un técnico,
    las sesiones abiertas con el anterior dejan de valer (el access hereda el `iat` del refresh).
    """
    generado = getattr(usuario, 'pin_generado_en', None)
    emitido = token.get('iat')
    return bool(generado and emitido is not None and emitido < int(generado.timestamp()))


def _revocada():
    return exceptions.AuthenticationFailed(
        'Tu PIN fue reiniciado. Vuelve a iniciar sesión con el PIN nuevo.', code='sesion_revocada')


def renovar_access(refresh_str):
    """Valida un refresh token y devuelve un nuevo access token."""
    try:
        refresh = RefreshToken(refresh_str)
    except TokenError:
        raise exceptions.AuthenticationFailed('Refresh token inválido o expirado.', code='token_invalido')
    usuario = cargar_usuario(refresh.get('tipo'), refresh.get('uid'))
    if usuario is None:
        raise exceptions.AuthenticationFailed('Usuario inexistente o inactivo.', code='usuario_inactivo')
    if sesion_revocada(usuario, refresh):
        raise _revocada()
    return str(refresh.access_token)


class JWTUsuarioAuthentication(BaseAuthentication):
    """
    Lee "Authorization: Bearer <access>", valida el token y deja en request.user el
    Administrador o Tecnico. El tipo queda en request.user.TIPO_USUARIO y en request.auth['tipo'].
    """

    keyword = b'bearer'

    def authenticate(self, request):
        partes = get_authorization_header(request).split()
        if not partes or partes[0].lower() != self.keyword:
            return None  # sin token: DRF lo tratará como no autenticado
        if len(partes) != 2:
            raise exceptions.AuthenticationFailed('Encabezado Authorization mal formado.', code='token_invalido')

        try:
            token = AccessToken(partes[1].decode('utf-8'))
        except (TokenError, UnicodeDecodeError):
            raise exceptions.AuthenticationFailed('Token inválido o expirado.', code='token_invalido')

        usuario = cargar_usuario(token.get('tipo'), token.get('uid'))
        if usuario is None:
            raise exceptions.AuthenticationFailed('Usuario inexistente o inactivo.', code='usuario_inactivo')
        if sesion_revocada(usuario, token):
            raise _revocada()
        return (usuario, token)

    def authenticate_header(self, request):
        # Hace que DRF responda 401 (y no 403) cuando falta o falla el token
        return 'Bearer'
